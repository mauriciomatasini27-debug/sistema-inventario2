// LANE admin — Write-through best-effort (espejo de control-db.ts).
//
// adminStore sigue siendo la fuente de verdad en monoproceso; esto solo
// agrega copia durable cuando hay CONTROL_DATABASE_URL viva. Nunca lanza:
// sin env/tabla/conexión el caller sigue con memoria.

import { and, asc, desc, eq } from "drizzle-orm";
import { getControlDb } from "./db.js";
import type { ActoAdmin } from "../modules/admin/actos.js";
import {
  adminAuditLog,
  billingLedgerEntries,
  dunningPolicies,
  migrationRollouts,
  platformAdmins,
  tenantDailyUsage,
  tenantFeatureOverrides,
  tenantHealthSignals,
  tenantLifecycleEvents,
} from "../db/schema-admin.js";
import { usageCounters } from "../db/schema-planes.js";
import {
  adminStore,
  type AdminActoMem,
  type AdminAsientoMem,
  type AdminEventoVidaMem,
  type AdminHealthMem,
  type AdminOverrideMem,
} from "./admin-store.js";
import { fechaAR } from "./fecha-ar.js";
import { crearAlmacenUsoPlanes } from "./repos/_almacen.js";
import { control } from "./store.js";
import {
  estimarMargen,
  guardarUsoDiario,
  type UsoDiarioContadores,
} from "../modules/admin/uso-margen.js";

type AdminDb = ReturnType<typeof getControlDb>;

async function intentarAdmin(fn: (db: AdminDb) => Promise<unknown>): Promise<boolean> {
  try {
    await fn(getControlDb());
    return true;
  } catch {
    return false;
  }
}

export function persistirActoAdmin(a: {
  actorGoogleSub: string;
  actoKind: string;
  tenantId: string | null;
  detalle: ActoAdmin;
  prevHash: string | null;
  hash: string;
  origen: string;
}): Promise<boolean> {
  return intentarAdmin((db) =>
    db.insert(adminAuditLog).values({
      actorGoogleSub: a.actorGoogleSub,
      actoKind: a.actoKind,
      tenantId: a.tenantId,
      detalle: a.detalle,
      prevHash: a.prevHash,
      hash: a.hash,
      origen: a.origen,
    }),
  );
}

export function persistirHealthAdmin(h: {
  tenantId: string;
  plan: string;
  estadoVisto: string;
  ticketsHoy: number;
  demosPurgadas: number;
  cobrosCentavos: bigint;
  ultimaSenalEn: string | null;
}): Promise<boolean> {
  return intentarAdmin((db) =>
    db
      .insert(tenantHealthSignals)
      .values({
        tenantId: h.tenantId,
        plan: h.plan,
        estadoVisto: h.estadoVisto,
        ticketsHoy: h.ticketsHoy,
        demosPurgadas: h.demosPurgadas,
        cobrosCentavos: h.cobrosCentavos,
        ultimaSenalEn: h.ultimaSenalEn ? new Date(h.ultimaSenalEn) : null,
      })
      .onConflictDoUpdate({
        target: tenantHealthSignals.tenantId,
        set: {
          plan: h.plan,
          estadoVisto: h.estadoVisto,
          ticketsHoy: h.ticketsHoy,
          demosPurgadas: h.demosPurgadas,
          cobrosCentavos: h.cobrosCentavos,
          ultimaSenalEn: h.ultimaSenalEn ? new Date(h.ultimaSenalEn) : null,
          actualizadoEn: new Date(),
        },
      }),
  );
}

export function persistirAsientoAdmin(a: {
  tenantId: string;
  montoCentavos: bigint;
  medio: string;
  referenciaExterna: string;
  idempotencyKey: string;
  asientoCompensatorioDe?: string | undefined;
  creadoPor: string;
}): Promise<boolean> {
  return intentarAdmin((db) =>
    db
      .insert(billingLedgerEntries)
      .values({
        tenantId: a.tenantId,
        montoCentavos: a.montoCentavos,
        medio: a.medio,
        referenciaExterna: a.referenciaExterna,
        idempotencyKey: a.idempotencyKey,
        asientoCompensatorioDe: a.asientoCompensatorioDe ?? null,
        creadoPor: a.creadoPor,
      })
      .onConflictDoNothing(),
  );
}

export function persistirEventoVidaAdmin(e: {
  tenantId: string;
  deEstado: string;
  aEstado: string;
  motivo: string;
  actor: string;
  idempotencyKey: string;
}): Promise<boolean> {
  return intentarAdmin((db) =>
    db
      .insert(tenantLifecycleEvents)
      .values({
        tenantId: e.tenantId,
        deEstado: e.deEstado,
        aEstado: e.aEstado,
        motivo: e.motivo,
        actor: e.actor,
        idempotencyKey: e.idempotencyKey,
      })
      .onConflictDoNothing(),
  );
}

export function persistirOverrideAdmin(o: {
  tenantId: string;
  flag: string;
  valor: boolean;
  motivo: string;
  expiraEn: string | null;
  creadoPor?: string | undefined;
}): Promise<boolean> {
  return intentarAdmin((db) =>
    db
      .insert(tenantFeatureOverrides)
      .values({
        tenantId: o.tenantId,
        flag: o.flag,
        valor: o.valor,
        motivo: o.motivo,
        expiraEn: o.expiraEn ? new Date(o.expiraEn) : null,
        creadoPor: o.creadoPor ?? null,
      })
      .onConflictDoUpdate({
        target: [tenantFeatureOverrides.tenantId, tenantFeatureOverrides.flag],
        set: {
          valor: o.valor,
          motivo: o.motivo,
          expiraEn: o.expiraEn ? new Date(o.expiraEn) : null,
          creadoPor: o.creadoPor ?? null,
          creadoEn: new Date(),
        },
      }),
  );
}

export async function leerActosAdmin(limite = 50): Promise<
  Array<{ hash: string; actoKind: string; tenantId: string | null; actorGoogleSub: string; creadoEn: Date }>
> {
  try {
    const filas = await getControlDb()
      .select({
        hash: adminAuditLog.hash,
        actoKind: adminAuditLog.actoKind,
        tenantId: adminAuditLog.tenantId,
        actorGoogleSub: adminAuditLog.actorGoogleSub,
        creadoEn: adminAuditLog.creadoEn,
      })
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.creadoEn))
      .limit(limite);
    return filas;
  } catch {
    return [];
  }
}

export async function contarHealthAdmin(): Promise<{
  tenants: number;
  suspendidosVistos: number;
} | null> {
  try {
    const filas = await getControlDb()
      .select({ estadoVisto: tenantHealthSignals.estadoVisto })
      .from(tenantHealthSignals);
    return {
      tenants: filas.length,
      suspendidosVistos: filas.filter((f) => f.estadoVisto === "suspendido").length,
    };
  } catch {
    return null;
  }
}

// P10-17: un sub de la allowlist que usa el panel queda registrado como
// admin de plataforma (google_sub es la clave, nunca el email).
export function persistirAdminPlataforma(googleSub: string): Promise<boolean> {
  return intentarAdmin((db) =>
    db.insert(platformAdmins).values({ googleSub, estado: "activo" }).onConflictDoNothing(),
  );
}

// P10-17: cada reintentar es un intento nuevo (id propio, la fila guarda el
// snap de estado e intentos del momento).
export function persistirRolloutAdmin(r: {
  tenantId: string;
  estado: string;
  intentos: number;
}): Promise<boolean> {
  return intentarAdmin((db) =>
    db.insert(migrationRollouts).values({
      tenantId: r.tenantId,
      estado: r.estado,
      intentos: r.intentos,
    }),
  );
}

export async function leerRolloutsAdmin(): Promise<
  Array<{ id: string; tenantId: string; estado: string; intentos: number }>
> {
  try {
    const filas = await getControlDb()
      .select()
      .from(migrationRollouts)
      .orderBy(migrationRollouts.creadoEn);
    return filas.map((f) => ({
      id: f.id,
      tenantId: f.tenantId,
      estado: f.estado,
      intentos: f.intentos,
    }));
  } catch {
    return [];
  }
}

const FEATURE_BOT = "bot_consulta";
const FEATURE_ASISTENTE = "asistente_ia";
const RX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function claveContadorUso(tenantId: string, mes: string, feature: string): string {
  return `${tenantId}|${mes}|${feature}`;
}

function leerContadorMemoria(tenantId: string, mes: string, feature: string): { usado: number; costoCentavos: bigint } {
  const v = crearAlmacenUsoPlanes().obtener(claveContadorUso(tenantId, mes, feature));
  return { usado: v?.usado ?? 0, costoCentavos: v?.costoCentavos ?? 0n };
}

async function leerContadorDb(
  tenantId: string,
  mes: string,
  feature: string,
): Promise<{ usado: number; costoCentavos: bigint } | null> {
  try {
    const [fila] = await getControlDb()
      .select({ usado: usageCounters.usado, costoCentavos: usageCounters.costoCentavos })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.tenantId, tenantId),
          eq(usageCounters.mes, mes),
          eq(usageCounters.feature, feature),
        ),
      )
      .limit(1);
    if (!fila) return null;
    return { usado: fila.usado, costoCentavos: fila.costoCentavos };
  } catch {
    return null;
  }
}

async function leerContadorPlanes(
  tenantId: string,
  mes: string,
  feature: string,
): Promise<{ usado: number; costoCentavos: bigint }> {
  const memoria = leerContadorMemoria(tenantId, mes, feature);
  const db = await leerContadorDb(tenantId, mes, feature);
  if (!db) return memoria;
  if (db.usado > memoria.usado || db.costoCentavos > memoria.costoCentavos) return db;
  return memoria;
}

function persistirUsoWaDiario(tenantId: string, dia: string, usoWa: number): Promise<boolean> {
  if (!RX_UUID.test(tenantId)) return Promise.resolve(false);
  return intentarAdmin((db) =>
    db
      .insert(tenantDailyUsage)
      .values({ tenantId, dia, tickets: 0, usoWa })
      .onConflictDoUpdate({
        target: [tenantDailyUsage.tenantId, tenantDailyUsage.dia],
        set: { usoWa },
      }),
  );
}

// P10-17 / PLAN-S12: usage_counters ya acumula bot y asistente; acá se
// proyecta a adminStore.usoDiario y, si el id es uuid, a tenant_daily_usage.
export async function sincronizarUsoDiarioDesdeContadores(dia: string = fechaAR()): Promise<void> {
  const mes = dia.slice(0, 7);
  for (const t of control.tenants.values()) {
    const bot = await leerContadorPlanes(t.id, mes, FEATURE_BOT);
    const llm = await leerContadorPlanes(t.id, mes, FEATURE_ASISTENTE);
    const uso: UsoDiarioContadores = {
      tenantId: t.id,
      dia,
      mensajesWa: bot.usado,
      consultasLlm: llm.usado,
      costoWaCentavos: bot.costoCentavos,
      costoLlmCentavos: llm.costoCentavos,
    };
    guardarUsoDiario(adminStore.usoDiario, uso);
    await persistirUsoWaDiario(t.id, dia, bot.usado);
  }
}

export function resumenUsoEnListadoTenants(
  tenantId: string,
  plan: string,
  dia: string = fechaAR(),
): { uso_wa: number; costo_alto: boolean } {
  const usos = [...adminStore.usoDiario.values()];
  const fila = usos.find((u) => u.tenantId === tenantId && u.dia === dia);
  const mes = dia.slice(0, 7);
  const marcado = estimarMargen({ tenantId, plan, mes, usos }).marcado;
  return { uso_wa: fila?.mensajesWa ?? 0, costo_alto: marcado };
}

export type DunningPolicyMem = {
  plan: string;
  diasGracia: number;
  diasASuspension: number;
  diasABaja: number;
  activa: boolean;
};

const TOPE_HIDRATAR = 500;

function isoFecha(d: Date | null | undefined): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function leerActosAdminMem(limite = TOPE_HIDRATAR): Promise<AdminActoMem[]> {
  try {
    const filas = await getControlDb()
      .select()
      .from(adminAuditLog)
      .orderBy(asc(adminAuditLog.creadoEn))
      .limit(limite);
    const salida: AdminActoMem[] = [];
    for (const f of filas) {
      const creadoEn = isoFecha(f.creadoEn);
      if (!creadoEn || typeof f.hash !== "string" || !f.detalle) continue;
      salida.push({
        id: f.hash,
        actorGoogleSub: f.actorGoogleSub,
        actoKind: f.actoKind,
        tenantId: f.tenantId,
        detalle: f.detalle,
        prevHash: f.prevHash,
        hash: f.hash,
        origen: f.origen,
        creadoEn,
      });
    }
    return salida;
  } catch {
    return [];
  }
}

export async function leerHealthAdminBatch(): Promise<AdminHealthMem[]> {
  try {
    const filas = await getControlDb().select().from(tenantHealthSignals);
    const salida: AdminHealthMem[] = [];
    for (const f of filas) {
      const actualizadoEn = isoFecha(f.actualizadoEn);
      if (!actualizadoEn || typeof f.tenantId !== "string" || typeof f.plan !== "string") continue;
      salida.push({
        tenantId: f.tenantId,
        plan: f.plan,
        estadoVisto: f.estadoVisto,
        ticketsHoy: f.ticketsHoy,
        demosPurgadas: f.demosPurgadas,
        cobrosCentavos: f.cobrosCentavos,
        ultimaSenalEn: isoFecha(f.ultimaSenalEn),
        actualizadoEn,
      });
    }
    return salida;
  } catch {
    return [];
  }
}

export async function leerAsientosAdminBatch(limite = TOPE_HIDRATAR): Promise<AdminAsientoMem[]> {
  try {
    const filas = await getControlDb()
      .select()
      .from(billingLedgerEntries)
      .orderBy(asc(billingLedgerEntries.creadoEn))
      .limit(limite);
    const salida: AdminAsientoMem[] = [];
    for (const f of filas) {
      const creadoEn = isoFecha(f.creadoEn);
      if (!creadoEn || typeof f.id !== "string" || typeof f.idempotencyKey !== "string") continue;
      salida.push({
        id: f.id,
        tenantId: f.tenantId,
        montoCentavos: f.montoCentavos,
        medio: f.medio,
        referenciaExterna: f.referenciaExterna,
        idempotencyKey: f.idempotencyKey,
        asientoCompensatorioDe: f.asientoCompensatorioDe ?? undefined,
        creadoPor: f.creadoPor,
        creadoEn,
      });
    }
    return salida;
  } catch {
    return [];
  }
}

export async function leerEventosVidaAdminBatch(limite = TOPE_HIDRATAR): Promise<AdminEventoVidaMem[]> {
  try {
    const filas = await getControlDb()
      .select()
      .from(tenantLifecycleEvents)
      .orderBy(asc(tenantLifecycleEvents.creadoEn))
      .limit(limite);
    const salida: AdminEventoVidaMem[] = [];
    for (const f of filas) {
      const creadoEn = isoFecha(f.creadoEn);
      if (!creadoEn || typeof f.id !== "string") continue;
      salida.push({
        id: f.id,
        tenantId: f.tenantId,
        deEstado: f.deEstado,
        aEstado: f.aEstado,
        motivo: f.motivo,
        actor: f.actor,
        idempotencyKey: f.idempotencyKey || f.id,
        creadoEn,
      });
    }
    return salida;
  } catch {
    return [];
  }
}

export async function leerOverridesAdminBatch(): Promise<AdminOverrideMem[]> {
  try {
    const filas = await getControlDb().select().from(tenantFeatureOverrides);
    const salida: AdminOverrideMem[] = [];
    for (const f of filas) {
      const creadoEn = isoFecha(f.creadoEn);
      if (!creadoEn || typeof f.tenantId !== "string" || typeof f.flag !== "string") continue;
      salida.push({
        tenantId: f.tenantId,
        flag: f.flag,
        valor: f.valor,
        motivo: f.motivo,
        expiraEn: isoFecha(f.expiraEn),
        creadoPor: f.creadoPor ?? undefined,
        creadoEn,
      });
    }
    return salida;
  } catch {
    return [];
  }
}

export async function leerPoliciesMoraAdminBatch(): Promise<Map<string, DunningPolicyMem>> {
  const salida = new Map<string, DunningPolicyMem>();
  try {
    const filas = await getControlDb().select().from(dunningPolicies);
    for (const f of filas) {
      if (typeof f.plan !== "string") continue;
      if (![f.diasGracia, f.diasASuspension, f.diasABaja].every((n) => Number.isInteger(n))) continue;
      salida.set(f.plan, {
        plan: f.plan,
        diasGracia: f.diasGracia,
        diasASuspension: f.diasASuspension,
        diasABaja: f.diasABaja,
        activa: f.activa,
      });
    }
  } catch {
    return new Map();
  }
  return salida;
}

export async function leerUsoDiarioAdminBatch(dia?: string): Promise<Map<string, UsoDiarioContadores>> {
  const salida = new Map<string, UsoDiarioContadores>();
  try {
    const q = getControlDb().select().from(tenantDailyUsage);
    const filas = dia ? await q.where(eq(tenantDailyUsage.dia, dia)) : await q;
    for (const f of filas) {
      if (typeof f.tenantId !== "string" || typeof f.dia !== "string") continue;
      const uso: UsoDiarioContadores = {
        tenantId: f.tenantId,
        dia: f.dia,
        mensajesWa: f.usoWa,
        consultasLlm: 0,
        costoWaCentavos: 0n,
        costoLlmCentavos: 0n,
      };
      salida.set(`${f.tenantId}|${f.dia}`, uso);
    }
  } catch {
    return new Map();
  }
  return salida;
}
