import type { APIRoute } from "astro";
import { z } from "zod";
import { resumenUsoEnListadoTenants, sincronizarUsoDiarioDesdeContadores } from "../../../lib/admin-db.js";
import { listarYSincronizarTenantsControl } from "../../../lib/control-db.js";
import { fechaAR } from "../../../lib/fecha-ar.js";
import { control } from "../../../lib/store.js";
import { adminStore } from "../../../lib/admin-store.js";
import { exigirAdminMutante, auditar, exigirAdminListo, exigirConfirmacion, leerJson } from "./_guard.js";
import { guardarEstadoTenant, suspenderPorAbuso, suspenderPorMora } from "./_suspender.js";
import { emailDeOwnerPendiente } from "../../../modules/tenants/alta-admin.js";
import { reintentarAprovisionamiento, resumenAprovisionamiento } from "../../../modules/tenants/provision-admin.js";

export const prerender = false;

// GET /api/admin/tenants — OP-S1 lista gestión (slug, estado, plan, vencimiento).
export const GET: APIRoute = async ({ request }) => {
  const admin = await exigirAdminListo(request);
  if (admin instanceof Response) return admin;
  const url = new URL(request.url);
  const estado = url.searchParams.get("estado") ?? "";
  const dia = fechaAR();
  // P1-87: sin este vuelco, un proceso frío con allowlist no lista los tenants de la DB.
  await listarYSincronizarTenantsControl();
  await sincronizarUsoDiarioDesdeContadores(dia);
  let lista = [...control.tenants.values()].map((t) => {
    const uso = resumenUsoEnListadoTenants(t.id, t.plan, dia);
    return {
      id: t.id,
      nombre: t.nombreComercio,
      slug: t.slug,
      estado: t.estado,
      plan: t.plan,
      vencimiento: (t as { trialHasta?: string }).trialHasta ?? null,
      suspension_tipo: t.suspensionTipo ?? null,
      email_dueno_pendiente: emailPendienteDueno(t.id, t.ownerGoogleSub),
      aprovisionamiento: resumenAprovisionamiento(t.id, t.estado),
      uso_wa: uso.uso_wa,
      costo_alto: uso.costo_alto,
    };
  });
  if (estado) lista = lista.filter((t) => t.estado === estado);
  return Response.json({ tenants: lista });
};

// POST /api/admin/tenants — accion suspender|suspender_abuso|reactivar con confirmo_id + motivo.
export const POST: APIRoute = async ({ request }) => {
  const admin = await exigirAdminMutante(request);
  if (admin instanceof Response) return admin;
  const body = await leerJson(request);
  if (body instanceof Response) return body;
  const parsed = z.object({ tenant_id: z.string().min(1), accion: z.enum(["suspender", "suspender_abuso", "reactivar", "reintentar_provision"]), confirmo_id: z.string().min(1), motivo: z.string().min(1).max(280) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "Datos inválidos." }, { status: 422 });
  const conf = exigirConfirmacion(body as Record<string, unknown>, parsed.data.tenant_id);
  if (conf instanceof Response) return conf;
  // P1-87: el id puede existir solo en la DB (proceso recién levantado). Un vuelco y se reintenta.
  let t = control.tenants.get(parsed.data.tenant_id);
  if (!t) {
    await listarYSincronizarTenantsControl();
    t = control.tenants.get(parsed.data.tenant_id);
  }
  if (!t) return Response.json({ error: "Tenant desconocido." }, { status: 404 });
  // Suspender sigue la misma regla que Mora (gracia 14 días): una sola puerta.
  if (parsed.data.accion === "suspender") {
    return suspenderPorMora({ tenantId: t.id, motivo: conf.motivo, actorSub: admin.googleSub });
  }
  // Abuso: inmediata, sin gracia; motivo y confirmación igual que mora.
  if (parsed.data.accion === "suspender_abuso") {
    return suspenderPorAbuso({ tenantId: t.id, motivo: conf.motivo, actorSub: admin.googleSub });
  }
  if (parsed.data.accion === "reintentar_provision") {
    const r = await reintentarAprovisionamiento(t.id);
    auditar({ kind: "provision_reintentada", tenantId: t.id }, admin.googleSub, "panel");
    return Response.json({ tenant_id: t.id, ...r }, { status: 200 });
  }
  if (t.estado === "activo") return Response.json({ error: "ya activo" }, { status: 409 });
  const de = t.estado;
  const tipoPrevio = t.suspensionTipo;
  t.estado = "activo";
  t.suspensionTipo = undefined;
  if (!(await guardarEstadoTenant(t.id, "activo"))) {
    t.estado = de;
    t.suspensionTipo = tipoPrevio;
    return Response.json({ error: "No se pudo guardar la reactivación. Probá de nuevo." }, { status: 503 });
  }
  adminStore.eventosVida.push({ id: crypto.randomUUID(), tenantId: t.id, deEstado: de, aEstado: t.estado, motivo: conf.motivo, actor: admin.googleSub, idempotencyKey: crypto.randomUUID(), creadoEn: new Date().toISOString() });
  auditar({ kind: "tenant_reactivado", tenantId: t.id }, admin.googleSub, "panel");
  return Response.json({ tenant_id: t.id, estado: t.estado });
};

function emailPendienteDueno(tenantId: string, ownerGoogleSub: string): string | null {
  const delPrefijo = emailDeOwnerPendiente(ownerGoogleSub);
  if (delPrefijo) return delPrefijo;
  for (const inv of control.invitations.values()) {
    if (inv.tenantId === tenantId && inv.rol === "dueno" && inv.estado === "pendiente") return inv.email;
  }
  return null;
}
