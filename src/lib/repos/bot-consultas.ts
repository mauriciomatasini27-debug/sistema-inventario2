import { and, eq, max, sql } from "drizzle-orm";
import { whatsappUsage } from "../../db/schema-whatsapp.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { crearAlmacenBotConsultas } from "./_almacen.js";
import { resumenConsultas, type ResumenConsultas } from "../../modules/whatsapp/tarjeta-bot.js";
import { fechaAR, mesAR } from "../fecha-ar.js";

// DASH-S3 (ADR-0034): registro y resumen de las consultas del bot para la
// tarjeta `Bot` de /panel. DB primero via dbVivaTenant(tenantId); sin base
// resoluble cae a la memoria del puerto Almacen; en multi un fallo de DB ya
// resuelta se propaga como BaseNoDisponible (la ruta responde 503).

// Que el comercio no tenga base asignada es "sin base", no un fallo de DB: la
// memoria es el fallback.
function dbDeConsultas(tenantId: string): TenantDb | null {
  try {
    return dbVivaTenant(tenantId);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return null;
    throw e;
  }
}

export interface ConsultaBot {
  readonly tenantId: string;
  readonly numeroE164: string;
  readonly wamid: string;
  readonly ahoraMs: number;
}

// Idempotente por wamid (Meta reintenta el webhook): onConflictDoNothing en DB
// y el mapa en memoria no pisa el primer registro. La memoria solo se usa sin
// base (o ante un fallo tolerado en single): con base viva no se acumula nada
// en el proceso.
function guardarEnMemoria(input: ConsultaBot): void {
  const almacen = crearAlmacenBotConsultas();
  if (!almacen.contiene(input.wamid)) {
    almacen.guardar(input.wamid, { tenantId: input.tenantId, creadoEnMs: input.ahoraMs });
  }
}

export async function registrarConsultaBot(input: ConsultaBot): Promise<void> {
  const db = dbDeConsultas(input.tenantId);
  if (!db) {
    guardarEnMemoria(input);
    return;
  }
  try {
    await db
      .insert(whatsappUsage)
      .values({
        tenantId: input.tenantId,
        numeroE164: input.numeroE164,
        wamid: input.wamid,
        tipo: "consulta",
        costoCentavos: 0n,
        estado: "recibido",
        createdAt: new Date(input.ahoraMs),
      })
      .onConflictDoNothing({ target: whatsappUsage.wamid });
  } catch (e) {
    crearAlmacenBotConsultas().anteFalloPersistencia(e);
    guardarEnMemoria(input);
  }
}

// Argentina no tiene horario de verano: el día AR arranca a las 00:00 -03:00.
function inicioDiaARMs(ahoraMs: number): number {
  return Date.parse(`${fechaAR(ahoraMs)}T00:00:00-03:00`);
}

function resumenMemoria(tenantId: string, ahoraMs: number): ResumenConsultas {
  const registros = [...crearAlmacenBotConsultas().comoMapaSoloLectura().values()]
    .filter((r) => r.tenantId === tenantId)
    .map((r) => ({ creadoEnMs: r.creadoEnMs }));
  return resumenConsultas(registros, ahoraMs);
}

export async function leerResumenConsultasBot(tenantId: string, ahoraMs: number): Promise<ResumenConsultas> {
  const db = dbDeConsultas(tenantId);
  if (!db) return resumenMemoria(tenantId, ahoraMs);
  try {
    // Agregado en SQL (count del día AR + max) para no traer todas las filas.
    // created_at es timestamp sin zona guardado en UTC (como lo escribe
    // drizzle); el parámetro va como texto UTC porque postgres-js no
    // serializa Date dentro de un sql`` crudo.
    const inicio = new Date(inicioDiaARMs(ahoraMs)).toISOString().replace("T", " ").replace("Z", "");
    const [fila] = await db
      .select({
        hoy: sql<number>`count(*) filter (where ${whatsappUsage.createdAt} >= ${inicio}::timestamp)`.mapWith(Number),
        ultima: max(whatsappUsage.createdAt),
      })
      .from(whatsappUsage)
      .where(and(eq(whatsappUsage.tenantId, tenantId), eq(whatsappUsage.tipo, "consulta")));
    const ultima = fila?.ultima ?? null;
    return { hoy: fila?.hoy ?? 0, ultimaEnMs: ultima === null ? null : new Date(ultima).getTime() };
  } catch (e) {
    crearAlmacenBotConsultas().anteFalloPersistencia(e);
    return resumenMemoria(tenantId, ahoraMs);
  }
}

// PLAN-S7: consultas del bot del mes civil AR, para el cupo de WhatsApp de
// /panel/plan. Misma fuente que la tarjeta `Bot` (whatsapp_usage tipo
// consulta); el mes arranca el día 1 a las 00:00 -03:00.
function inicioMesARMs(ahoraMs: number): number {
  return Date.parse(`${mesAR(ahoraMs)}-01T00:00:00-03:00`);
}

function consultasMesMemoria(tenantId: string, ahoraMs: number): number {
  const desde = inicioMesARMs(ahoraMs);
  return [...crearAlmacenBotConsultas().comoMapaSoloLectura().values()].filter(
    (r) => r.tenantId === tenantId && r.creadoEnMs >= desde && r.creadoEnMs <= ahoraMs,
  ).length;
}

export async function contarConsultasBotDelMes(tenantId: string, ahoraMs: number): Promise<number> {
  const db = dbDeConsultas(tenantId);
  if (!db) return consultasMesMemoria(tenantId, ahoraMs);
  try {
    const inicio = new Date(inicioMesARMs(ahoraMs)).toISOString().replace("T", " ").replace("Z", "");
    const [fila] = await db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(whatsappUsage)
      .where(
        and(
          eq(whatsappUsage.tenantId, tenantId),
          eq(whatsappUsage.tipo, "consulta"),
          sql`${whatsappUsage.createdAt} >= ${inicio}::timestamp`,
        ),
      );
    return fila?.total ?? 0;
  } catch (e) {
    crearAlmacenBotConsultas().anteFalloPersistencia(e);
    return consultasMesMemoria(tenantId, ahoraMs);
  }
}
