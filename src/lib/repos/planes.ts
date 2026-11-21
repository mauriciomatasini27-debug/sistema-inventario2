import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  costoContabilidadBotConsultaUsdCentavos,
  planDe,
  resolverCatalogo,
  TARIFA_META_USD_FIJADA_EN_PRODUCTO,
  type Catalogo,
  type Feature,
  type PlanEjemplo,
  type PlanId,
} from "../../modules/planes/catalogo.js";
import {
  crearPreaprobacionMercadoPago,
  crearPreaprobacionSuscripcionMp,
  type EstadoPreapprovalMp,
  type ProveedorCobro,
  type ResultadoPreaprobacionMp,
  type ResultadoSuscripcionMp,
  type Suscripcion,
} from "../../modules/planes/proveedor.js";
import { planVigenteDe } from "../../modules/planes/ciclo.js";
import { mpPreapprovalTenants } from "../../db/schema.js";
import { planFeatures, plans, subscriptions, usageCounters } from "../../db/schema-planes.js";
import { getSharedDbPlataforma } from "../db.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import { conTenant, esModoShared } from "../tenant-mode.js";
import {
  crearAlmacenSuscripciones,
  crearAlmacenUsoPlanes,
  type SuscripcionPlanes,
} from "./_almacen.js";
import { contarConsultasBotDelMes } from "./bot-consultas.js";
import { fechaAR, type FechaAR } from "../fecha-ar.js";

function primerDiaMesSiguienteAR(hoy: FechaAR): FechaAR {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const proximoAnio = mes === 12 ? anio + 1 : anio;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  return `${proximoAnio}-${String(proximoMes).padStart(2, "0")}-01` as FechaAR;
}

function diaMesTextoAR(fecha: FechaAR): string {
  return `${Number(fecha.slice(8, 10))}/${Number(fecha.slice(5, 7))}`;
}

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

// MORA-14: módulos de pago se apagan tras 14 días de cobro rechazado (núcleo sigue).
export const MORA_COBRO_DIAS = 14 as const;
const MS_POR_DIA = 86_400_000;

const FEATURES_MODULOS_PAGO: ReadonlySet<Feature> = new Set([
  "alertas_email",
  "bot_consulta",
  "alertas_whatsapp",
  "bot_rubro",
  "asistente_ia",
]);

const preapprovalPorTenant = new Map<string, string>();
const rechazoCobroPorTenant = new Map<string, string>();

export function olvidarMoraCobroEnMemoria(): void {
  preapprovalPorTenant.clear();
  rechazoCobroPorTenant.clear();
}

const RX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dbPreapprovalVinculo(): TenantDb | null {
  if (esModoShared() && process.env.TENANT_DATABASE_URL) return getSharedDbPlataforma();
  return dbVivaTenant();
}

async function persistirVinculoPreaprobacionDb(preapprovalId: string, tenantId: string): Promise<void> {
  if (!RX_UUID.test(tenantId)) return;
  const db = dbPreapprovalVinculo();
  if (!db) return;
  try {
    await db
      .insert(mpPreapprovalTenants)
      .values({ preapprovalId, tenantId })
      .onConflictDoUpdate({
        target: mpPreapprovalTenants.preapprovalId,
        set: { tenantId },
      });
  } catch {
    // Sin base o schema viejo: el mapa en memoria sigue siendo el respaldo del proceso.
  }
}

export function vincularPreaprobacionTenant(preapprovalId: string, tenantId: string): void {
  preapprovalPorTenant.set(preapprovalId, tenantId);
  void persistirVinculoPreaprobacionDb(preapprovalId, tenantId);
}

// P1-74: memoria del proceso y fila en mp_preapproval_tenants (migración 0044).
export async function tenantIdDePreapproval(preapprovalId: string): Promise<string | undefined> {
  const mem = preapprovalPorTenant.get(preapprovalId);
  if (mem) return mem;
  const db = dbPreapprovalVinculo();
  if (!db) return undefined;
  try {
    const filas = await db
      .select({ tenantId: mpPreapprovalTenants.tenantId })
      .from(mpPreapprovalTenants)
      .where(eq(mpPreapprovalTenants.preapprovalId, preapprovalId))
      .limit(1);
    const tid = filas[0]?.tenantId;
    if (tid) preapprovalPorTenant.set(preapprovalId, tid);
    return tid;
  } catch {
    return undefined;
  }
}

export function registrarEstadoCobroMp(args: {
  readonly preapprovalId: string;
  readonly estado: "activo" | "gracia" | "suspendido";
  readonly occurredAt?: string | undefined;
}): void {
  const tenantId = preapprovalPorTenant.get(args.preapprovalId);
  if (!tenantId) return;
  if (args.estado === "activo") {
    rechazoCobroPorTenant.delete(tenantId);
    return;
  }
  const cuando = args.occurredAt ?? new Date().toISOString();
  if (!rechazoCobroPorTenant.has(tenantId)) rechazoCobroPorTenant.set(tenantId, cuando);
}

// P1-91: el pago rechazado llega con el preapproval_id del GET, que puede
// estar solo en la base. Se resuelve el comercio antes de marcar la mora.
export async function registrarCobroMpPorPreapproval(args: {
  readonly preapprovalId: string;
  readonly estado: "activo" | "gracia" | "suspendido";
  readonly occurredAt?: string | undefined;
}): Promise<void> {
  const tenantId =
    preapprovalPorTenant.get(args.preapprovalId) ?? (await tenantIdDePreapproval(args.preapprovalId));
  if (!tenantId) return;
  preapprovalPorTenant.set(args.preapprovalId, tenantId);
  registrarEstadoCobroMp(args);
}

// P1-91: reason es el único campo libre del preapproval sin plan; el alta
// escribe "Plan <id>" y acá se recupera el plan para persistir subscriptions.
export function planIdDeReasonMp(reason: string | undefined): PlanId | null {
  if (!reason) return null;
  const m = reason.toLowerCase().match(/\b(basico|plus|pro)\b/);
  return m ? (m[1] as PlanId) : null;
}

async function marcarProveedorSuscripcionMp(suscripcionId: string, preapprovalId: string): Promise<void> {
  const db = dbVivaTenant();
  if (db) {
    try {
      await db
        .update(subscriptions)
        .set({ proveedor: "mercadopago", proveedorRef: preapprovalId })
        .where(eq(subscriptions.id, suscripcionId));
    } catch (e) {
      crearAlmacenSuscripciones().anteFalloPersistencia(e);
    }
  }
  const mapa = crearAlmacenSuscripciones();
  const actual = mapa.obtener(suscripcionId);
  if (actual) {
    mapa.guardar(suscripcionId, { ...actual, proveedor: "mercadopago", proveedorRef: preapprovalId });
  }
}

async function vinculoProveedorSuscripcion(
  suscripcionId: string,
): Promise<{ readonly proveedor: string | null; readonly proveedorRef: string | null }> {
  const db = dbVivaTenant();
  if (db) {
    try {
      const filas = await db
        .select({ proveedor: subscriptions.proveedor, proveedorRef: subscriptions.proveedorRef })
        .from(subscriptions)
        .where(eq(subscriptions.id, suscripcionId))
        .limit(1);
      const f = filas[0];
      if (f) return { proveedor: f.proveedor, proveedorRef: f.proveedorRef };
    } catch (e) {
      crearAlmacenSuscripciones().anteFalloPersistencia(e);
    }
  }
  const mem = crearAlmacenSuscripciones().obtener(suscripcionId);
  return { proveedor: mem?.proveedor ?? null, proveedorRef: mem?.proveedorRef ?? null };
}

// P1-91: estado real del preapproval → subscriptions. El CHECK de 0025
// solo admite activa|cancelada: authorized enciende, paused y cancelled
// apagan, pending no toca nada porque el cobro aún no ocurrió.
export async function aplicarEstadoPreapprovalMp(args: {
  readonly preapprovalId: string;
  readonly tenantId?: string | undefined;
  readonly planId?: PlanId | null | undefined;
  readonly estado: EstadoPreapprovalMp;
}): Promise<Suscripcion | null> {
  const tenantId = args.tenantId ?? (await tenantIdDePreapproval(args.preapprovalId));
  if (!tenantId) return null;
  vincularPreaprobacionTenant(args.preapprovalId, tenantId);
  if (args.estado === "pending") return null;
  const estado: Exclude<EstadoPreapprovalMp, "pending"> = args.estado;
  // P1-91: el webhook corre sin middleware: en shared el contexto de comercio lo pone
  // acá el external_reference que devolvió MP.
  const aplicar = () =>
    aplicarEstadoPreapprovalEnTenant(args.preapprovalId, tenantId, args.planId ?? null, estado);
  return esModoShared() ? conTenant(tenantId, aplicar) : aplicar();
}

async function aplicarEstadoPreapprovalEnTenant(
  preapprovalId: string,
  tenantId: string,
  planId: PlanId | null,
  estado: Exclude<EstadoPreapprovalMp, "pending">,
): Promise<Suscripcion | null> {
  if (estado === "authorized") {
    let activa = await leerSuscripcionActiva(tenantId);
    if (!activa) {
      if (!planId) return null;
      activa = await crearProveedorCobro().crearSuscripcion({ tenantId, planId });
    } else if (planId && activa.planId !== planId) {
      activa = await aplicarUpgradeInmediato({
        tenantId,
        suscripcionId: activa.id,
        planId,
      });
    }
    await marcarProveedorSuscripcionMp(activa.id, preapprovalId);
    registrarEstadoCobroMp({ preapprovalId, estado: "activo" });
    return activa;
  }
  const activa = await leerSuscripcionActiva(tenantId);
  if (!activa) return null;
  const vinculo = await vinculoProveedorSuscripcion(activa.id);
  const esDeEstaPreaprobacion =
    vinculo.proveedorRef === preapprovalId ||
    (vinculo.proveedorRef == null && vinculo.proveedor === "mercadopago");
  if (!esDeEstaPreaprobacion) return null;
  return crearProveedorCobro().cancelar(activa.id);
}

function modulosPagosEnMora(tenantId: string, ahoraMs: number): boolean {
  const iso = rechazoCobroPorTenant.get(tenantId);
  if (!iso) return false;
  return ahoraMs - Date.parse(iso) >= MORA_COBRO_DIAS * MS_POR_DIA;
}

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
    desde: f.desde,
    hasta: f.hasta,
    planProgramado: f.planProgramado !== null && esPlanConocido(f.planProgramado) ? (f.planProgramado as PlanId) : null,
  };
}

function memoriaASuscripcion(s: SuscripcionPlanes): Suscripcion {
  return {
    id: s.id,
    tenantId: s.tenantId,
    planId: s.planId as PlanId,
    estado: s.estado,
    desde: s.desde ?? null,
    hasta: s.hasta ?? null,
    planProgramado: s.planProgramado != null && esPlanConocido(s.planProgramado) ? (s.planProgramado as PlanId) : null,
  };
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

// PLAN-S4: si el cambio programado ya llegó, el plan vigente es el programado
// (el resolvedor rueda sin job; la persistencia del rollover es best-effort).
function aplicarProgramado(sub: Suscripcion, ahora: Date): { readonly sub: Suscripcion; readonly aplico: boolean } {
  const vigente = planVigenteDe({
    planId: sub.planId,
    planProgramado: sub.planProgramado ?? null,
    hasta: sub.hasta ?? null,
    ahora,
  });
  if (vigente.planId === sub.planId) return { sub, aplico: false };
  // El ciclo nuevo arranca el día del cambio.
  return {
    sub: { ...sub, planId: vigente.planId, planProgramado: null, desde: sub.hasta ?? null, hasta: null },
    aplico: true,
  };
}

function activaRoladaEnMemoria(tenantId: string, ahora: Date): Suscripcion | null {
  const sub = activaEnMemoria(tenantId);
  if (!sub) return null;
  const r = aplicarProgramado(sub, ahora);
  if (r.aplico) crearAlmacenSuscripciones().guardar(r.sub.id, { ...r.sub });
  return r.sub;
}

export async function leerSuscripcionActiva(tenantId: string): Promise<Suscripcion | null> {
  exigirTenant(tenantId);
  const ahora = new Date();
  const db = dbVivaTenant();
  if (!db) return activaRoladaEnMemoria(tenantId, ahora);
  try {
    const filas = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.estado, "activa")))
      .limit(1);
    const f = filas[0];
    if (!f) return activaRoladaEnMemoria(tenantId, ahora);
    const r = aplicarProgramado(filaASuscripcion(f), ahora);
    if (r.aplico) {
      try {
        await db
          .update(subscriptions)
          .set({ planId: r.sub.planId, planProgramado: null, desde: r.sub.desde ?? new Date(), hasta: null })
          .where(eq(subscriptions.id, r.sub.id));
      } catch (e) {
        crearAlmacenSuscripciones().anteFalloPersistencia(e);
      }
    }
    crearAlmacenSuscripciones().guardar(r.sub.id, { ...r.sub });
    return r.sub;
  } catch (e) {
    crearAlmacenSuscripciones().anteFalloPersistencia(e);
    return activaRoladaEnMemoria(tenantId, ahora);
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
  const incluidaPlan = plan.features[feature] === true;
  if (!incluidaPlan) return { incluida: false, cupo: null, planId: plan.id };
  if (
    feature !== "nucleo" &&
    FEATURES_MODULOS_PAGO.has(feature) &&
    modulosPagosEnMora(tenantId, Date.now())
  ) {
    return { incluida: false, cupo: null, planId: plan.id };
  }
  return { incluida: true, cupo: plan.cupos[feature] ?? null, planId: plan.id };
}

export type ResultadoCupoConsultaBot =
  | { readonly tipo: "seguir" }
  | { readonly tipo: "aviso"; readonly usado: number; readonly cupo: number }
  | { readonly tipo: "agotado"; readonly mensaje: string; readonly usado: number; readonly cupo: number }
  | { readonly tipo: "suspendida"; readonly mensaje: string };

// WA-CUPO / PLAN-S6: mora suspende antes del techo mensual; PLAN-S11 avisa al
// 80% y corta al 100% sin gastar cupo en el mensaje agotado.
export async function evaluarCupoConsultaBot(args: {
  readonly tenantId: string;
  readonly ahoraMs: number;
}): Promise<ResultadoCupoConsultaBot> {
  exigirTenant(args.tenantId);
  if (modulosPagosEnMora(args.tenantId, args.ahoraMs)) {
    return {
      tipo: "suspendida",
      mensaje: "La cuenta está suspendida. Regularizá la suscripción para seguir operando.",
    };
  }
  const inc = await planIncluye(args.tenantId, "bot_consulta");
  if (!inc.incluida || inc.cupo === null) return { tipo: "seguir" };
  const usado = await contarConsultasBotDelMes(args.tenantId, args.ahoraMs);
  const cupo = inc.cupo;
  if (usado >= cupo) {
    const reinicia_el = primerDiaMesSiguienteAR(fechaAR(args.ahoraMs));
    const mensaje = `Llegaste al cupo de WhatsApp del mes. Se reinicia el ${diaMesTextoAR(reinicia_el)}.`;
    return { tipo: "agotado", mensaje, usado, cupo };
  }
  const proximo = usado + 1;
  if (proximo * 100 >= cupo * 80) return { tipo: "aviso", usado: proximo, cupo };
  return { tipo: "seguir" };
}

let proximoMem = 1;

function crearEnMemoria(tenantId: string, planId: PlanId): Suscripcion {
  const mapa = crearAlmacenSuscripciones();
  for (const s of mapa.mapaVivo().values()) {
    if (s.tenantId === tenantId && s.estado === "activa") mapa.guardar(s.id, { ...s, estado: "cancelada" });
  }
  const sub: Suscripcion = {
    id: `sub-mem-${proximoMem++}`,
    tenantId,
    planId,
    estado: "activa",
    desde: new Date(),
    hasta: null,
    planProgramado: null,
  };
  mapa.guardar(sub.id, { ...sub });
  return sub;
}

function programarEnMemoria(args: {
  readonly tenantId: string;
  readonly suscripcionId: string;
  readonly planProgramado: PlanId | null;
  readonly hasta: Date | null;
}): Suscripcion {
  const mapa = crearAlmacenSuscripciones();
  const actual = mapa.obtener(args.suscripcionId);
  if (!actual || actual.tenantId !== args.tenantId) {
    throw new Error(`suscripción desconocida: ${args.suscripcionId}`);
  }
  const next: SuscripcionPlanes = { ...actual, planProgramado: args.planProgramado, hasta: args.hasta };
  mapa.guardar(args.suscripcionId, next);
  return memoriaASuscripcion(next);
}

function upgradeEnMemoria(args: {
  readonly tenantId: string;
  readonly suscripcionId: string;
  readonly planId: PlanId;
}): Suscripcion {
  const mapa = crearAlmacenSuscripciones();
  const actual = mapa.obtener(args.suscripcionId);
  if (!actual || actual.tenantId !== args.tenantId || actual.estado !== "activa") {
    throw new Error(`suscripción desconocida: ${args.suscripcionId}`);
  }
  const next: SuscripcionPlanes = { ...actual, planId: args.planId, planProgramado: null };
  mapa.guardar(args.suscripcionId, next);
  return memoriaASuscripcion(next);
}

// PLAN-S3: el plan vigente pasa al destino en el acto. La ruta solo lo llama
// con un cobro confirmado. Limpia plan_programado para que una baja agendada
// no pise el upgrade. El update filtra por tenantId.
export async function aplicarUpgradeInmediato(args: {
  readonly tenantId: string;
  readonly suscripcionId: string;
  readonly planId: PlanId;
}): Promise<Suscripcion> {
  exigirTenant(args.tenantId);
  const db = dbVivaTenant();
  if (!db) return upgradeEnMemoria(args);
  try {
    const filas = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, args.suscripcionId), eq(subscriptions.tenantId, args.tenantId)))
      .limit(1);
    const f = filas[0];
    if (!f || f.estado !== "activa") throw new Error(`suscripción desconocida: ${args.suscripcionId}`);
    await db
      .update(subscriptions)
      .set({ planId: args.planId, planProgramado: null })
      .where(and(eq(subscriptions.id, args.suscripcionId), eq(subscriptions.tenantId, args.tenantId)));
    const sub: Suscripcion = { ...filaASuscripcion(f), planId: args.planId, planProgramado: null };
    crearAlmacenSuscripciones().guardar(sub.id, { ...sub });
    return sub;
  } catch (e) {
    if (esErrorPropio(e)) throw e;
    crearAlmacenSuscripciones().anteFalloPersistencia(e);
    return upgradeEnMemoria(args);
  }
}

// PLAN-S4: guarda (o cancela, con null) el cambio de plan programado en la
// suscripción activa junto con `hasta`, la fecha en que rige, para que el
// rollover no dependa de cuándo se lea. DB primero con el mismo patrón
// memoria/DB del resto del repo; no toca el plan vigente.
export async function programarCambioPlan(args: {
  readonly tenantId: string;
  readonly suscripcionId: string;
  readonly planProgramado: PlanId | null;
  readonly hasta: Date | null;
}): Promise<Suscripcion> {
  exigirTenant(args.tenantId);
  const db = dbVivaTenant();
  if (!db) return programarEnMemoria(args);
  try {
    const filas = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, args.suscripcionId), eq(subscriptions.tenantId, args.tenantId)))
      .limit(1);
    const f = filas[0];
    if (!f || f.estado !== "activa") throw new Error(`suscripción desconocida: ${args.suscripcionId}`);
    await db
      .update(subscriptions)
      .set({ planProgramado: args.planProgramado, hasta: args.hasta })
      .where(eq(subscriptions.id, args.suscripcionId));
    const sub: Suscripcion = { ...filaASuscripcion(f), planProgramado: args.planProgramado, hasta: args.hasta };
    crearAlmacenSuscripciones().guardar(sub.id, { ...sub });
    return sub;
  } catch (e) {
    if (esErrorPropio(e)) throw e;
    crearAlmacenSuscripciones().anteFalloPersistencia(e);
    return programarEnMemoria(args);
  }
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

// COBRO-EJEMPLO: punto único para alta de preaprobación MP respetando ejemplo.
export async function solicitarPreaprobacionPlan(args: {
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<ResultadoPreaprobacionMp> {
  const catalogo = await leerCatalogo();
  const r = await crearPreaprobacionMercadoPago({
    tenantId: args.tenantId,
    planId: args.planId,
    catalogo,
    fetchImpl: args.fetchImpl,
  });
  if (r.ok) vincularPreaprobacionTenant(r.preapprovalId, args.tenantId);
  return r;
}

// P1-91: alta real de la preaprobación sin plan con el body oficial.
// El monto en ARS queda pendiente de Mauri: se envía el del catálogo tal cual.
export async function solicitarSuscripcionPlan(args: {
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly payerEmail: string;
  readonly backUrl: string;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<ResultadoSuscripcionMp> {
  const catalogo = await leerCatalogo();
  const plan = planDe(catalogo, args.planId);
  const r = await crearPreaprobacionSuscripcionMp({
    tenantId: args.tenantId,
    planId: args.planId,
    montoArs: plan.precioMensualUSD,
    payerEmail: args.payerEmail,
    backUrl: args.backUrl,
    fetchImpl: args.fetchImpl,
  });
  if (r.ok) vincularPreaprobacionTenant(r.preapprovalId, args.tenantId);
  return r;
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
// TARIFA-META: usage_counters guarda costo en centavos USD; bot_consulta usa 0
// hasta que exista tarifa contractual (no 0.0260 fijo en producto).
export function costoUsoFeatureCentavos(feature: string, costoPedido: bigint): bigint {
  if (feature === "bot_consulta" && !TARIFA_META_USD_FIJADA_EN_PRODUCTO) {
    return costoContabilidadBotConsultaUsdCentavos();
  }
  return costoPedido;
}

export async function registrarUso(e: UsoEntrada): Promise<UsoContado> {
  exigirUso(e);
  const costoCentavos = costoUsoFeatureCentavos(e.feature, e.costoCentavos);
  const entrada = costoCentavos === e.costoCentavos ? e : { ...e, costoCentavos };
  const db = dbVivaTenant();
  if (!db) return sumarEnMemoria(entrada);
  try {
    const filas = await db
      .insert(usageCounters)
      .values({
        tenantId: entrada.tenantId,
        mes: entrada.mes,
        feature: entrada.feature,
        usado: entrada.cantidad,
        costoCentavos: entrada.costoCentavos,
      })
      .onConflictDoUpdate({
        target: [usageCounters.tenantId, usageCounters.mes, usageCounters.feature],
        set: {
          usado: sql`${usageCounters.usado} + ${entrada.cantidad}`,
          costoCentavos: sql`${usageCounters.costoCentavos} + ${entrada.costoCentavos}`,
          updatedAt: new Date(),
        },
      })
      .returning({ usado: usageCounters.usado, costoCentavos: usageCounters.costoCentavos });
    const f = filas[0];
    const vista: UsoContado = {
      usado: f?.usado ?? entrada.cantidad,
      costoCentavos: f?.costoCentavos ?? entrada.costoCentavos,
    };
    crearAlmacenUsoPlanes().guardar(claveUso(entrada.tenantId, entrada.mes, entrada.feature), { ...vista });
    return vista;
  } catch (err) {
    crearAlmacenUsoPlanes().anteFalloPersistencia(err);
    return sumarEnMemoria(entrada);
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
  olvidarMoraCobroEnMemoria();
  proximoMem = 1;
}
