import { and, desc, eq } from "drizzle-orm";
import { mpPreapprovalTenants } from "../db/schema.js";
import { tenantLifecycleEvents } from "../db/schema-admin.js";
import { getControlDb, getSharedDbPlataforma } from "./db.js";
import { dbVivaTenant } from "./server-db.js";
import { esModoShared } from "./tenant-mode.js";
import { fechaAR } from "./fecha-ar.js";
import { control } from "./store.js";
import { adminStore } from "./admin-store.js";
import { persistirEventoVidaAdmin } from "./admin-db.js";
import { persistirAuthEvent, persistirEstadoTenant, revocarSesionDb, revocarSesionesTenantDb } from "./control-db.js";
import { crearProveedorCobro, leerSuscripcionActiva } from "./repos/planes.js";
import { encolarEnvio } from "./repos/email.js";
import { cancelarPreaprobacionMercadoPago, type ResultadoCancelacionMp } from "../modules/planes/cancelar-mp.js";
import { DIAS_REAPERTURA, decidir_reapertura, type MotivoNoReapertura } from "../modules/tenants/cierre-cuenta.js";

// P10-91: cierre de cuenta por el dueño (desde /panel/plan) y reapertura por
// soporte (/admin). Cerrar corta el acceso al instante (estado baja + sesiones
// revocadas), cancela la suscripción de Mercado Pago sin devolución y encola
// el mail de cierre. El job de retención (P10-90) borra a los 90 días.

export interface DepsCierre {
  listarPreaprobaciones: (tenantId: string) => Promise<string[]>;
  cancelarMp: (preapprovalId: string) => Promise<ResultadoCancelacionMp>;
}

// P10-91: lectura propia de mp_preapproval_tenants (misma base que usa
// planes.ts) para no tocar el repo de cobro que está cambiando P1-91.
async function preaprobacionesDb(tenantId: string): Promise<string[]> {
  try {
    const db = esModoShared() ? getSharedDbPlataforma() : dbVivaTenant();
    if (!db) return [];
    const filas = await db
      .select({ id: mpPreapprovalTenants.preapprovalId })
      .from(mpPreapprovalTenants)
      .where(eq(mpPreapprovalTenants.tenantId, tenantId));
    return filas.map((f) => f.id).sort();
  } catch {
    return [];
  }
}

export const depsCierreReales: DepsCierre = {
  listarPreaprobaciones: preaprobacionesDb,
  cancelarMp: (preapprovalId) => cancelarPreaprobacionMercadoPago({ preapprovalId }),
};

export interface ResultadoCierre {
  readonly estadoAnterior: string;
  readonly mpCanceladas: string[];
  readonly mpPendientes: string[];
  readonly emailEncolado: boolean;
}

export async function cerrarCuenta(args: {
  readonly tenantId: string;
  readonly googleSub: string;
  readonly ahora?: Date | undefined;
  readonly deps?: DepsCierre | undefined;
}): Promise<ResultadoCierre> {
  const ahora = args.ahora ?? new Date();
  const deps = args.deps ?? depsCierreReales;
  const t = control.tenants.get(args.tenantId);
  if (!t) throw new Error("tenant desconocido");
  const de = t.estado;

  // P10-91 (1) corte de acceso: el middleware rechaza todo comercio que no esté activo
  // o suspendido, y las sesiones del comercio quedan revocadas.
  t.estado = "baja";
  control.tenants.set(t.id, t);
  await persistirEstadoTenant(t.id, "baja");
  const evento = {
    id: crypto.randomUUID(),
    tenantId: t.id,
    deEstado: de,
    aEstado: "baja",
    motivo: "cierre_por_dueno",
    actor: args.googleSub,
    idempotencyKey: `cierre-dueno:${t.id}:${ahora.toISOString()}`,
    creadoEn: ahora.toISOString(),
  };
  adminStore.eventosVida.push(evento);
  await persistirEventoVidaAdmin(evento);
  for (const s of control.sessions.values()) {
    if (s.tenantId !== t.id || s.revocadaAt) continue;
    s.revocadaAt = ahora.toISOString();
    s.motivo = "cuenta_cerrada";
    void revocarSesionDb(s.idHash, "cuenta_cerrada");
  }
  await revocarSesionesTenantDb(t.id, "cuenta_cerrada");

  // P10-91 (2) Mercado Pago: cancela sin devolución. Si MP falla, la cuenta igual
  // queda cerrada y la preaprobación sale como pendiente para soporte.
  const mpCanceladas: string[] = [];
  const mpPendientes: string[] = [];
  for (const id of await deps.listarPreaprobaciones(t.id)) {
    const r = await deps.cancelarMp(id);
    (r.ok ? mpCanceladas : mpPendientes).push(id);
  }
  try {
    const sub = await leerSuscripcionActiva(t.id);
    if (sub) await crearProveedorCobro().cancelar(sub.id);
  } catch {
    // P10-91: sin suscripción local legible no hay nada que cancelar acá.
  }

  // P10-91 (3) registro y mail de cierre.
  const detalle = { mp_canceladas: mpCanceladas.length, mp_pendientes: mpPendientes };
  control.events.push({ tenantId: t.id, tipo: "cuenta_cerrada", actor: args.googleSub, detalle, creadoEn: ahora.toISOString() });
  await persistirAuthEvent({ tenantId: t.id, tipo: "cuenta_cerrada", actor: args.googleSub, detalle });
  let emailEncolado = false;
  const email = control.users.get(t.ownerGoogleSub)?.email ?? control.users.get(args.googleSub)?.email;
  if (email) {
    try {
      const borrado = new Date(ahora.getTime() + DIAS_REAPERTURA * 86_400_000);
      const r = await encolarEnvio({
        key: `cuenta-cerrada:${t.id}:${ahora.toISOString()}`,
        stream: "cuenta",
        to: email,
        plantilla: "cuenta_cerrada_v1",
        vars: { comercio: t.nombreComercio, cerrada_el: fechaAR(ahora), borrado_desde: fechaAR(borrado) },
        tenantId: t.id,
      });
      emailEncolado = r.ok;
    } catch {
      emailEncolado = false;
    }
  }
  return { estadoAnterior: de, mpCanceladas, mpPendientes, emailEncolado };
}

// P10-91: fecha del último cierre: memoria del panel admin y, si el proceso
// está frío, tenant_lifecycle_events.
async function ultimaBaja(tenantId: string): Promise<string | null> {
  let ultima: string | null = null;
  for (const e of adminStore.eventosVida) {
    if (e.tenantId === tenantId && e.aEstado === "baja" && (!ultima || e.creadoEn > ultima)) ultima = e.creadoEn;
  }
  try {
    const [f] = await getControlDb()
      .select({ creadoEn: tenantLifecycleEvents.creadoEn })
      .from(tenantLifecycleEvents)
      .where(and(eq(tenantLifecycleEvents.tenantId, tenantId), eq(tenantLifecycleEvents.aEstado, "baja")))
      .orderBy(desc(tenantLifecycleEvents.creadoEn))
      .limit(1);
    const db = f ? new Date(f.creadoEn).toISOString() : null;
    if (db && (!ultima || db > ultima)) ultima = db;
  } catch {
    // P10-91: sin base vale la memoria.
  }
  return ultima;
}

export async function reabrirCuenta(args: {
  readonly tenantId: string;
  readonly adminSub: string;
  readonly motivo: string;
  readonly ahora?: Date | undefined;
}): Promise<{ ok: true } | { ok: false; motivo: MotivoNoReapertura | "desconocido" }> {
  const ahora = args.ahora ?? new Date();
  const t = control.tenants.get(args.tenantId);
  if (!t) return { ok: false, motivo: "desconocido" };
  const d = decidir_reapertura({ estado: t.estado, bajaEn: await ultimaBaja(t.id), ahora });
  if (!d.ok) return d;
  t.estado = "activo";
  control.tenants.set(t.id, t);
  await persistirEstadoTenant(t.id, "activo");
  const evento = {
    id: crypto.randomUUID(),
    tenantId: t.id,
    deEstado: "baja",
    aEstado: "activo",
    motivo: args.motivo,
    actor: args.adminSub,
    idempotencyKey: `reapertura:${t.id}:${ahora.toISOString()}`,
    creadoEn: ahora.toISOString(),
  };
  adminStore.eventosVida.push(evento);
  await persistirEventoVidaAdmin(evento);
  return { ok: true };
}
