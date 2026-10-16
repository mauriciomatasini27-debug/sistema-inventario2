import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  planDe,
  resolverCatalogo,
  type Catalogo,
  type Feature,
  type PlanEjemplo,
  type PlanId,
} from "../../modules/planes/catalogo.js";
import type { ProveedorCobro, Suscripcion } from "../../modules/planes/proveedor.js";
import { planFeatures, plans, subscriptions, usageCounters } from "../../db/schema-planes.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import {
  crearAlmacenSuscripciones,
  crearAlmacenUsoPlanes,
  type SuscripcionPlanes,
} from "./_almacen.js";

// PLAN-S1/S10 (PRD-PLAN-01, ADR-0047): planes, suscripciones y contadores de
// uso. DB primero via dbVivaTenant(); solo en single sin base usa la memoria
// del corte 19. En multi sin base dbVivaTenant lanza BaseNoDisponible y se
// propaga (la ruta responde 503). El tenantId siempre lo da el llamador (la
// sesión); nunca sale de un cuerpo pedido por el usuario.

const ORDEN_PLANES: ReadonlyArray<PlanId> = ["basico", "plus", "pro"];

const FEATURES: ReadonlyArray<Feature> = [
  "nucleo",
  "alertas_email",
  "bot_consulta",
  "alertas_whatsapp",
  "bot_rubro",
  "asistente_ia",
];

const RX_MES = /^\d{4}-\d{2}$/;

function esPlanConocido(id: string): id is PlanId {
  return (ORDEN_PLANES as ReadonlyArray<string>).includes(id);
}

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId requerido");
}

// El 23505 vive en cause (el driver lo envuelve); el nombre del índice
// distingue la activa duplicada de otro choque único.
function esChoqueUnico(e: unknown, indice: string): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur; i++) {
    if (typeof (cur as { code?: unknown }).code === "string" && (cur as { code: string }).code === "23505") return true;
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (msg.includes(indice)) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

function filaASuscripcion(f: typeof subscriptions.$inferSelect): Suscripcion {
  return {
    id: f.id,
    tenantId: f.tenantId,
    planId: f.planId as PlanId,
    estado: f.estado as Suscripcion["estado"],
  };
}

function memoriaASuscripcion(s: SuscripcionPlanes): Suscripcion {
  return { id: s.id, tenantId: s.tenantId, planId: s.planId as PlanId, estado: s.estado };
}

// Catálogo desde plans+plan_features. Features ausentes quedan como no
// incluidas sin cupo; planes fuera del trio conocido no se publican. Vacío es
// base sin semilla y cae al ejemplo, igual que el modo memoria.
async function catalogoDesdeDb(db: TenantDb): Promise<Catalogo | null> {
  const filasPlanes = await db.select().from(plans);
  const conocidos = filasPlanes.filter((f) => esPlanConocido(f.id));
  if (conocidos.length === 0) return null;
  const filasFeatures = await db.select().from(planFeatures);
  const porPlan = new Map<string, Map<string, (typeof filasFeatures)[number]>>();
  for (const f of filasFeatures) {
    let m = porPlan.get(f.planId);
    if (!m) {
      m = new Map();
      porPlan.set(f.planId, m);
    }
    m.set(f.feature, f);
  }
  const salida: PlanEjemplo[] = [];
  for (const id of ORDEN_PLANES) {
    const f = conocidos.find((p) => p.id === id);
    if (!f) continue;
    const feats = porPlan.get(id);
    const features = {} as Record<Feature, boolean>;
    const cupos = {} as Record<Feature, number | null>;
    for (const k of FEATURES) {
      features[k] = feats?.get(k)?.incluida ?? false;
      cupos[k] = feats?.get(k)?.cupoMensual ?? null;
    }
    salida.push(
      Object.freeze({
        id,
        nombre: f.nombre,
        precioMensualUSD: Number(f.precioMensualUsdCentavos) / 100,
        ejemplo: true as const,
        features: Object.freeze({ ...features }),
        cupos: Object.freeze({ ...cupos }),
        modulosRubro: Object.freeze([...f.modulosRubro]),
      }),
    );
  }
  return Object.freeze(salida);
}

export async function leerCatalogo(): Promise<Catalogo> {
  const db = dbVivaTenant();
  if (!db) return resolverCatalogo();
  try {
    return (await catalogoDesdeDb(db)) ?? resolverCatalogo();
  } catch (e) {
    crearAlmacenSuscripciones().anteFalloPersistencia(e);
    return resolverCatalogo();
  }
}

function activaEnMemoria(tenantId: string): Suscripcion | null {
  for (const s of crearAlmacenSuscripciones().comoMapaSoloLectura().values()) {
    if (s.tenantId === tenantId && s.estado === "activa") return memoriaASuscripcion(s);
  }
  return null;
}

export async function leerSuscripcionActiva(tenantId: string): Promise<Suscripcion | null> {
  exigirTenant(tenantId);
  const db = dbVivaTenant();
  if (!db) return activaEnMemoria(tenantId);
  try {
    const filas = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.estado, "activa")))
      .limit(1);
    const f = filas[0];
    if (!f) return activaEnMemoria(tenantId);
    const sub = filaASuscripcion(f);
    crearAlmacenSuscripciones().guardar(sub.id, { ...sub });
    return sub;
  } catch (e) {
    crearAlmacenSuscripciones().anteFalloPersistencia(e);
    return activaEnMemoria(tenantId);
  }
}

export interface InclusionPlan {
  readonly incluida: boolean;
  readonly cupo: number | null;
  readonly planId: PlanId | null;
}

// Único resolvedor de acceso por plan: sin suscripción activa nada está
// incluido (cierra en falso en vez de regalar módulos).
export async function planIncluye(tenantId: string, feature: Feature): Promise<InclusionPlan> {
  exigirTenant(tenantId);
  const activa = await leerSuscripcionActiva(tenantId);
  if (!activa) return { incluida: false, cupo: null, planId: null };
  const catalogo = await leerCatalogo();
  const plan = catalogo.find((p) => p.id === activa.planId) ?? null;
  if (!plan) return { incluida: false, cupo: null, planId: activa.planId };
  const incluida = plan.features[feature] === true;
  return { incluida, cupo: incluida ? plan.cupos[feature] : null, planId: plan.id };
}

let proximoMem = 1;

function crearEnMemoria(tenantId: string, planId: PlanId): Suscripcion {
  const mapa = crearAlmacenSuscripciones();
  for (const s of mapa.mapaVivo().values()) {
    if (s.tenantId === tenantId && s.estado === "activa") mapa.guardar(s.id, { ...s, estado: "cancelada" });
  }
  const sub: Suscripcion = { id: `sub-mem-${proximoMem++}`, tenantId, planId, estado: "activa" };
  mapa.guardar(sub.id, { ...sub });
  return sub;
}

function cancelarEnMemoria(suscripcionId: string): Suscripcion {
  const mapa = crearAlmacenSuscripciones();
  const actual = mapa.obtener(suscripcionId);
  if (!actual) throw new Error(`suscripción desconocida: ${suscripcionId}`);
  const cancelada: SuscripcionPlanes = { ...actual, estado: "cancelada" };
  mapa.guardar(suscripcionId, cancelada);
  return memoriaASuscripcion(cancelada);
}

function estadoEnMemoria(suscripcionId: string): Suscripcion {
  const actual = crearAlmacenSuscripciones().obtener(suscripcionId);
  if (!actual) throw new Error(`suscripción desconocida: ${suscripcionId}`);
  return memoriaASuscripcion(actual);
}

function esErrorPropio(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.message.startsWith("plan desconocido") ||
      e.message.startsWith("suscripción desconocida") ||
      e.message.startsWith("el tenant ya tiene"))
  );
}

// Cobro sobre subscriptions. Crear con una activa vigente la reemplaza: en la
// misma transacción cancela la anterior y crea la nueva, así el índice parcial
// subscriptions_tenant_activa_uq nunca ve dos activas. Una carrera entre dos
// altas responde "activa en curso" en la perdedora en vez de duplicar.
export class ProveedorCobroDb implements ProveedorCobro {
  async crearSuscripcion(args: { tenantId: string; planId: PlanId }): Promise<Suscripcion> {
    exigirTenant(args.tenantId);
    const db = dbVivaTenant();
    if (!db) {
      planDe(resolverCatalogo(), args.planId);
      return crearEnMemoria(args.tenantId, args.planId);
    }
    try {
      const catalogo = (await catalogoDesdeDb(db)) ?? resolverCatalogo();
      planDe(catalogo, args.planId);
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx
          .update(subscriptions)
          .set({ estado: "cancelada", hasta: new Date() })
          .where(and(eq(subscriptions.tenantId, args.tenantId), eq(subscriptions.estado, "activa")));
        await tx.insert(subscriptions).values({
          id,
          tenantId: args.tenantId,
          planId: args.planId,
          estado: "activa",
          proveedor: "manual",
        });
      });
      const sub: Suscripcion = { id, tenantId: args.tenantId, planId: args.planId, estado: "activa" };
      crearAlmacenSuscripciones().guardar(id, { ...sub });
      return sub;
    } catch (e) {
      if (esErrorPropio(e)) throw e;
      if (esChoqueUnico(e, "subscriptions_tenant_activa_uq")) {
        throw new Error("el tenant ya tiene una suscripción activa en curso");
      }
      crearAlmacenSuscripciones().anteFalloPersistencia(e);
      return crearEnMemoria(args.tenantId, args.planId);
    }
  }

  async cancelar(suscripcionId: string): Promise<Suscripcion> {
    const db = dbVivaTenant();
    if (!db) return cancelarEnMemoria(suscripcionId);
    try {
      const filas = await db.select().from(subscriptions).where(eq(subscriptions.id, suscripcionId)).limit(1);
      const f = filas[0];
      if (!f) throw new Error(`suscripción desconocida: ${suscripcionId}`);
      if (f.estado !== "cancelada") {
        await db
          .update(subscriptions)
          .set({ estado: "cancelada", hasta: new Date() })
          .where(eq(subscriptions.id, suscripcionId));
      }
      const sub: Suscripcion = { ...filaASuscripcion(f), estado: "cancelada" };
      crearAlmacenSuscripciones().guardar(sub.id, { ...sub });
      return sub;
    } catch (e) {
      if (esErrorPropio(e)) throw e;
      crearAlmacenSuscripciones().anteFalloPersistencia(e);
      return cancelarEnMemoria(suscripcionId);
    }
  }

  async estado(suscripcionId: string): Promise<Suscripcion> {
    const db = dbVivaTenant();
    if (!db) return estadoEnMemoria(suscripcionId);
    try {
      const filas = await db.select().from(subscriptions).where(eq(subscriptions.id, suscripcionId)).limit(1);
      const f = filas[0];
      if (!f) throw new Error(`suscripción desconocida: ${suscripcionId}`);
      const sub = filaASuscripcion(f);
      crearAlmacenSuscripciones().guardar(sub.id, { ...sub });
      return sub;
    } catch (e) {
      if (esErrorPropio(e)) throw e;
      crearAlmacenSuscripciones().anteFalloPersistencia(e);
      return estadoEnMemoria(suscripcionId);
    }
  }
}

// Puerto ARQ-S4: la elección memoria-vs-DB vive en ProveedorCobroDb; acá solo
// se entrega el puerto. ProveedorCobroFake sigue para tests unitarios sin repo.
export function crearProveedorCobro(): ProveedorCobro {
  dbVivaTenant();
  return new ProveedorCobroDb();
}

export interface UsoEntrada {
  readonly tenantId: string;
  readonly mes: string;
  readonly feature: string;
  readonly cantidad: number;
  readonly costoCentavos: bigint;
}

export interface UsoContado {
  readonly usado: number;
  readonly costoCentavos: bigint;
}

function exigirUso(e: UsoEntrada): void {
  exigirTenant(e.tenantId);
  if (!RX_MES.test(e.mes)) throw new Error("mes inválido: se espera AAAA-MM");
  if (!e.feature) throw new Error("feature requerida");
  if (!Number.isInteger(e.cantidad) || e.cantidad < 0) throw new Error("cantidad inválida");
  if (typeof e.costoCentavos !== "bigint" || e.costoCentavos < 0n) throw new Error("costo inválido");
}

function claveUso(tenantId: string, mes: string, feature: string): string {
  return `${tenantId}|${mes}|${feature}`;
}

function sumarEnMemoria(e: UsoEntrada): UsoContado {
  const mapa = crearAlmacenUsoPlanes();
  const clave = claveUso(e.tenantId, e.mes, e.feature);
  const previo = mapa.obtener(clave) ?? { usado: 0, costoCentavos: 0n };
  const vista = { usado: previo.usado + e.cantidad, costoCentavos: previo.costoCentavos + e.costoCentavos };
  mapa.guardar(clave, vista);
  return vista;
}

// Upsert por (tenant, mes, feature): el choque de PK suma en vez de pisar,
// así dos procesos que miden a la vez no pierden uso.
export async function registrarUso(e: UsoEntrada): Promise<UsoContado> {
  exigirUso(e);
  const db = dbVivaTenant();
  if (!db) return sumarEnMemoria(e);
  try {
    const filas = await db
      .insert(usageCounters)
      .values({
        tenantId: e.tenantId,
        mes: e.mes,
        feature: e.feature,
        usado: e.cantidad,
        costoCentavos: e.costoCentavos,
      })
      .onConflictDoUpdate({
        target: [usageCounters.tenantId, usageCounters.mes, usageCounters.feature],
        set: {
          usado: sql`${usageCounters.usado} + ${e.cantidad}`,
          costoCentavos: sql`${usageCounters.costoCentavos} + ${e.costoCentavos}`,
          updatedAt: new Date(),
        },
      })
      .returning({ usado: usageCounters.usado, costoCentavos: usageCounters.costoCentavos });
    const f = filas[0];
    const vista: UsoContado = { usado: f?.usado ?? e.cantidad, costoCentavos: f?.costoCentavos ?? e.costoCentavos };
    crearAlmacenUsoPlanes().guardar(claveUso(e.tenantId, e.mes, e.feature), { ...vista });
    return vista;
  } catch (err) {
    crearAlmacenUsoPlanes().anteFalloPersistencia(err);
    return sumarEnMemoria(e);
  }
}

export async function leerUso(args: {
  readonly tenantId: string;
  readonly mes: string;
  readonly feature: string;
}): Promise<UsoContado | null> {
  exigirTenant(args.tenantId);
  const db = dbVivaTenant();
  if (!db) {
    const v = crearAlmacenUsoPlanes().obtener(claveUso(args.tenantId, args.mes, args.feature));
    return v ? { ...v } : null;
  }
  try {
    const filas = await db
      .select({ usado: usageCounters.usado, costoCentavos: usageCounters.costoCentavos })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.tenantId, args.tenantId),
          eq(usageCounters.mes, args.mes),
          eq(usageCounters.feature, args.feature),
        ),
      )
      .limit(1);
    const f = filas[0];
    if (!f) return null;
    const vista: UsoContado = { usado: f.usado, costoCentavos: f.costoCentavos };
    crearAlmacenUsoPlanes().guardar(claveUso(args.tenantId, args.mes, args.feature), { ...vista });
    return vista;
  } catch (e) {
    crearAlmacenUsoPlanes().anteFalloPersistencia(e);
    const v = crearAlmacenUsoPlanes().obtener(claveUso(args.tenantId, args.mes, args.feature));
    return v ? { ...v } : null;
  }
}

export function olvidarPlanesEnMemoria(): void {
  crearAlmacenSuscripciones().mapaVivo().clear();
  crearAlmacenUsoPlanes().mapaVivo().clear();
  proximoMem = 1;
}
