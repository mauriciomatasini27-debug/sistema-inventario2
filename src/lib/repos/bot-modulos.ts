import { eq } from "drizzle-orm";
import { crearAlmacenBotModulos } from "./_almacen.js";
import { tenantBotModules } from "../../db/schema-planes.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import {
  MODULOS_BOT,
  defaultsDeRubro,
  resolverRubroBot,
  rubrosAvanzadosHabilitados,
  type ModuloBot,
} from "../../modules/bot/modulos-rubro.js";

// BOT-S1/S2 (ADR-0039): persistencia de los módulos del bot por tenant. DB
// primero via dbVivaTenant(tenantId); las rutas que la usan (panel, webhook,
// alta) no corren bajo el middleware de datos, así que el tenant va explícito,
// como en los otros caminos de control. Sin base resoluble cae a la memoria del
// puerto Almacen; en multi un fallo de DB ya resuelta se propaga como
// BaseNoDisponible (la ruta responde 503).
function ordenar(modulos: Iterable<string>): ModuloBot[] {
  const set = new Set(modulos);
  return MODULOS_BOT.filter((m) => set.has(m));
}

// Que el tenant no tenga base asignada (alta de un comercio recién creado,
// single sin base) es "sin base", no un fallo de DB: la memoria es el fallback.
function dbDeModulos(tenantId: string): TenantDb | null {
  try {
    return dbVivaTenant(tenantId);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return null;
    throw e;
  }
}

interface EstadoBot {
  readonly hayFilas: boolean;
  readonly activos: ModuloBot[];
}

function estadoMemoria(tenantId: string): EstadoBot {
  const previo = crearAlmacenBotModulos().obtener(tenantId);
  if (!previo) return { hayFilas: false, activos: [...MODULOS_BOT] };
  return { hayFilas: true, activos: ordenar(previo.activos) };
}

// `hayFilas` distingue "todo apagado" (6 filas activo=false) de "sin registro"
// (tenant previo a BOT-S1, bot completo).
async function estadoDb(db: TenantDb, tenantId: string): Promise<EstadoBot> {
  const filas = await db
    .select({ modulo: tenantBotModules.modulo, activo: tenantBotModules.activo })
    .from(tenantBotModules)
    .where(eq(tenantBotModules.tenantId, tenantId));
  if (filas.length === 0) return { hayFilas: false, activos: [...MODULOS_BOT] };
  return { hayFilas: true, activos: ordenar(filas.filter((f) => f.activo).map((f) => f.modulo)) };
}

// Un tenant sin filas (alta previa a BOT-S1) conserva el bot de antes: todos los
// módulos prendidos. Recién al guardar o al terminar un alta nueva rige el rubro.
export async function leerModulosBot(tenantId: string): Promise<ModuloBot[]> {
  const db = dbDeModulos(tenantId);
  if (!db) return estadoMemoria(tenantId).activos;
  try {
    const estado = await estadoDb(db, tenantId);
    if (estado.hayFilas) crearAlmacenBotModulos().guardar(tenantId, { tenantId, activos: estado.activos });
    return estado.activos;
  } catch (e) {
    crearAlmacenBotModulos().anteFalloPersistencia(e);
    return estadoMemoria(tenantId).activos;
  }
}

// Guarda las 6 filas en una sola transacción con upsert por (tenant, módulo),
// así "todo apagado" queda como 6 filas y se distingue de "sin registro".
export async function guardarModulosBot(tenantId: string, activos: readonly ModuloBot[]): Promise<void> {
  const ordenados = ordenar(activos);
  const almacen = crearAlmacenBotModulos();
  almacen.guardar(tenantId, { tenantId, activos: ordenados });
  const db = dbDeModulos(tenantId);
  if (!db) return;
  const prendidos = new Set<string>(ordenados);
  try {
    await db.transaction(async (tx) => {
      for (const modulo of MODULOS_BOT) {
        const activo = prendidos.has(modulo);
        await tx
          .insert(tenantBotModules)
          .values({ tenantId, modulo, activo, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [tenantBotModules.tenantId, tenantBotModules.modulo],
            set: { activo, updatedAt: new Date() },
          });
      }
    });
  } catch (e) {
    almacen.anteFalloPersistencia(e);
  }
}

export async function cambiarModuloBot(tenantId: string, modulo: ModuloBot, activo: boolean): Promise<ModuloBot[]> {
  const set = new Set<string>(await leerModulosBot(tenantId));
  if (activo) set.add(modulo);
  else set.delete(modulo);
  const next = ordenar(set);
  await guardarModulosBot(tenantId, next);
  return next;
}

// Idempotente: si el tenant ya tiene módulos cargados no los pisa (el dueño
// pudo apagar uno después del alta). El rubro del onboarding se resuelve al
// rubro del bot y recién ahí se eligen los defaults.
export async function aplicarDefaultsModulosBot(
  tenantId: string,
  rubroOnboarding: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ModuloBot[]> {
  const db = dbDeModulos(tenantId);
  let estado: EstadoBot;
  if (db) {
    try {
      estado = await estadoDb(db, tenantId);
    } catch (e) {
      crearAlmacenBotModulos().anteFalloPersistencia(e);
      estado = estadoMemoria(tenantId);
    }
  } else {
    estado = estadoMemoria(tenantId);
  }
  if (estado.hayFilas) return estado.activos;
  const rubro = resolverRubroBot(rubroOnboarding);
  const defaults = defaultsDeRubro(rubro, { rubrosAvanzados: rubrosAvanzadosHabilitados(env) });
  await guardarModulosBot(tenantId, defaults);
  return defaults;
}
