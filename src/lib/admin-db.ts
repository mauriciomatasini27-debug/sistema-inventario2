// LANE admin — Write-through best-effort (espejo de control-db.ts).
//
// adminStore sigue siendo la fuente de verdad en monoproceso; esto solo
// agrega copia durable cuando hay CONTROL_DATABASE_URL viva. Nunca lanza:
// sin env/tabla/conexión el caller sigue con memoria.

import { desc } from "drizzle-orm";
import { getControlDb } from "./db.js";
import type { ActoAdmin } from "../modules/admin/actos.js";
import {
  adminAuditLog,
  billingLedgerEntries,
  tenantFeatureOverrides,
  tenantHealthSignals,
  tenantLifecycleEvents,
} from "../db/schema-admin.js";

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
