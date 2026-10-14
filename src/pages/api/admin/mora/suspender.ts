import type { APIRoute } from "astro";
import { control } from "../../../../lib/store.js";
import { adminStore } from "../../../../lib/admin-store.js";
import { persistirEventoVidaAdmin } from "../../../../lib/admin-db.js";
import { auditar, exigirAdmin, exigirConfirmacion, leerJson } from "../_guard.js";
import { jsonError } from "../../../../lib/control.js";
import { aplicar_evento_vida } from "../../../../modules/admin/mora.js";
import { fechaAR } from "../../../../lib/fecha-ar.js";

export const prerender = false;

// POST /api/admin/mora/suspender — emite lifecycle event y lo aplica inline
// (mismo proceso; el worker control lo aplicará en multiproceso, fase 2).
// Admin NUNCA importa server-db ni schemas de negocio (PA3).
export const POST: APIRoute = async ({ request }) => {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;

  const parsed = await leerJson(request);
  if (parsed instanceof Response) return parsed;
  const tenantId = typeof parsed["tenant_id"] === "string" ? parsed["tenant_id"] : "";
  const tenant = control.tenants.get(tenantId);
  if (!tenant) return jsonError("No tenés permiso para ver el panel.", 403);
  const conf = exigirConfirmacion(parsed, tenantId);
  if (conf instanceof Response) return conf;

  const hoy = fechaAR();
  const idemKey = `suspender:${tenantId}:${hoy}`;
  if (adminStore.eventosVida.some((e) => e.idempotencyKey === idemKey)) {
    return Response.json({ tenant_id: tenantId, estado: tenant.estado, ya: true }, { status: 200 });
  }

  const deEstado = tenant.estado;
  const aEstado = aplicar_evento_vida(deEstado, "suspendido");
  tenant.estado = aEstado;
  const evento = {
    id: `evt:${idemKey}`,
    tenantId,
    deEstado,
    aEstado,
    motivo: conf.motivo,
    actor: `panel:${admin.googleSub}`,
    idempotencyKey: idemKey,
    creadoEn: new Date().toISOString(),
  };
  adminStore.eventosVida.push(evento);
  void persistirEventoVidaAdmin({
    tenantId,
    deEstado: evento.deEstado,
    aEstado,
    motivo: conf.motivo,
    actor: evento.actor,
    idempotencyKey: idemKey,
  });
  auditar({ kind: "suspension_marcada", tenantId, motivo: conf.motivo }, admin.googleSub, "panel");
  return Response.json({ tenant_id: tenantId, estado: aEstado }, { status: 200 });
};
