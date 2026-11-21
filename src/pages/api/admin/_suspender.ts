// LANE admin — Suspensión, única para Tenants y Mora (PRD-CP-01 CP-S7/CP-S16).
//
// Mora: se suspende desde el día 15 de atraso (gracia 14, POLITICA_DEFECTO)
// contado desde el vencimiento del tenant; antes, 409. Abuso: inmediata, sin
// gracia, con motivo; el acto y el evento quedan marcados como abuso.
// El estado tiene que quedar en la base: con CONTROL_DATABASE_URL, si no se
// pudo escribir se revierte la memoria y se responde 503 en vez de 200.

import { control } from "../../../lib/store.js";
import type { ControlTenant } from "../../../lib/store.js";
import { adminStore } from "../../../lib/admin-store.js";
import { persistirEventoVidaAdmin } from "../../../lib/admin-db.js";
import { persistirEstadoTenant } from "../../../lib/control-db.js";
import { fechaAR } from "../../../lib/fecha-ar.js";
import { jsonError } from "../../../lib/control.js";
import { POLITICA_DEFECTO, aplicar_evento_vida } from "../../../modules/admin/mora.js";
import { diasAtrasoDesdeVencimiento } from "../../../modules/admin/mora-vista.js";
import { auditar } from "./_guard.js";

export async function guardarEstadoTenant(tenantId: string, estado: "activo" | "suspendido"): Promise<boolean> {
  const ok = await persistirEstadoTenant(tenantId, estado);
  return ok || !process.env.CONTROL_DATABASE_URL;
}

export async function suspenderPorMora(args: {
  tenantId: string;
  motivo: string;
  actorSub: string;
}): Promise<Response> {
  const tenant = control.tenants.get(args.tenantId);
  if (!tenant) return jsonError("Tenant desconocido.", 404);
  const hoy = fechaAR();
  // Reintento sobre un suspendido: idempotente. Si se reactivó y se vuelve a
  // suspender el mismo día, la clave del día ya existe y se le agrega sufijo.
  if (tenant.estado === "suspendido") {
    return Response.json({ tenant_id: tenant.id, estado: tenant.estado, ya: true }, { status: 200 });
  }
  const dias = diasAtrasoDesdeVencimiento(tenant.trialHasta ?? null, hoy);
  if (dias < POLITICA_DEFECTO.diasASuspension) {
    return Response.json(
      {
        error: `En gracia: lleva ${dias} días de atraso y se puede suspender desde el día ${POLITICA_DEFECTO.diasASuspension}.`,
        dias_atraso: dias,
      },
      { status: 409 },
    );
  }

  return aplicarSuspension(tenant, "mora", args.motivo, args.actorSub);
}

export async function suspenderPorAbuso(args: {
  tenantId: string;
  motivo: string;
  actorSub: string;
}): Promise<Response> {
  const tenant = control.tenants.get(args.tenantId);
  if (!tenant) return jsonError("Tenant desconocido.", 404);
  if (tenant.estado === "suspendido") {
    return Response.json({ tenant_id: tenant.id, estado: tenant.estado, ya: true }, { status: 200 });
  }
  return aplicarSuspension(tenant, "abuso", args.motivo, args.actorSub);
}

async function aplicarSuspension(
  tenant: ControlTenant,
  tipo: "mora" | "abuso",
  motivo: string,
  actorSub: string,
): Promise<Response> {
  const hoy = fechaAR();
  const motivoEvento = tipo === "abuso" ? `abuso: ${motivo}` : motivo;
  const base = `suspender:${tenant.id}:${hoy}`;
  const idemKey = adminStore.eventosVida.some((e) => e.idempotencyKey === base) ? `${base}:${crypto.randomUUID()}` : base;
  const deEstado = tenant.estado;
  const aEstado = aplicar_evento_vida(deEstado, "suspendido");
  tenant.estado = aEstado;
  tenant.suspensionTipo = tipo;
  if (!(await guardarEstadoTenant(tenant.id, "suspendido"))) {
    tenant.estado = deEstado;
    tenant.suspensionTipo = undefined;
    return jsonError("No se pudo guardar la suspensión. Probá de nuevo.", 503);
  }
  const evento = {
    id: `evt:${idemKey}`,
    tenantId: tenant.id,
    deEstado,
    aEstado,
    motivo: motivoEvento,
    actor: `panel:${actorSub}`,
    idempotencyKey: idemKey,
    creadoEn: new Date().toISOString(),
  };
  adminStore.eventosVida.push(evento);
  void persistirEventoVidaAdmin({
    tenantId: tenant.id,
    deEstado,
    aEstado,
    motivo: motivoEvento,
    actor: evento.actor,
    idempotencyKey: idemKey,
  });
  auditar({ kind: tipo === "abuso" ? "suspension_abuso" : "suspension_marcada", tenantId: tenant.id, motivo }, actorSub, "panel");
  return Response.json({ tenant_id: tenant.id, estado: aEstado, tipo }, { status: 200 });
}
