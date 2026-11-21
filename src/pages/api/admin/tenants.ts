import type { APIRoute } from "astro";
import { z } from "zod";
import { resumenUsoEnListadoTenants, sincronizarUsoDiarioDesdeContadores } from "../../../lib/admin-db.js";
import { listarYSincronizarTenantsControl, persistirEstadoTenant } from "../../../lib/control-db.js";
import { fechaAR } from "../../../lib/fecha-ar.js";
import { control } from "../../../lib/store.js";
import { adminStore } from "../../../lib/admin-store.js";
import { reabrirCuenta } from "../../../lib/cierre-cuenta.js";
import { auditar, exigirAdminListo, exigirConfirmacion, leerJson } from "./_guard.js";

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
      backup: "diario",
      uso_wa: uso.uso_wa,
      costo_alto: uso.costo_alto,
    };
  });
  if (estado) lista = lista.filter((t) => t.estado === estado);
  return Response.json({ tenants: lista });
};

// POST /api/admin/tenants — accion suspender|reactivar|reabrir con confirmo_id + motivo.
// P10-91: una cuenta cerrada (baja) solo vuelve con "reabrir", dentro de los
// 90 días del cierre; "reactivar" no la toca.
export const POST: APIRoute = async ({ request }) => {
  const admin = await exigirAdminListo(request);
  if (admin instanceof Response) return admin;
  const body = await leerJson(request);
  if (body instanceof Response) return body;
  const parsed = z.object({ tenant_id: z.string().min(1), accion: z.enum(["suspender", "reactivar", "reabrir"]), confirmo_id: z.string().min(1), motivo: z.string().min(1).max(280) }).safeParse(body);
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
  const adminSub = (admin as { googleSub: string }).googleSub;
  if (parsed.data.accion === "reabrir") {
    const r = await reabrirCuenta({ tenantId: t.id, adminSub, motivo: (conf as { motivo: string }).motivo });
    if (!r.ok) {
      const msg =
        r.motivo === "vencida"
          ? "Pasaron los 90 días del cierre: la cuenta ya no se puede reabrir."
          : r.motivo === "no_cerrada"
            ? "La cuenta no está cerrada."
            : "No hay fecha de cierre registrada.";
      return Response.json({ error: msg }, { status: 409 });
    }
    auditar({ kind: "tenant_reabierto", tenantId: t.id }, adminSub, "panel");
    return Response.json({ tenant_id: t.id, estado: "activo" });
  }
  if (t.estado === "baja") return Response.json({ error: "La cuenta está cerrada: usá reabrir." }, { status: 409 });
  if (t.estado === (parsed.data.accion === "suspender" ? "suspendido" : "activo")) {
    return Response.json({ error: parsed.data.accion === "suspender" ? "ya suspendido" : "ya activo" }, { status: 409 });
  }
  const de = t.estado;
  const estadoNuevo = parsed.data.accion === "suspender" ? "suspendido" : "activo";
  t.estado = estadoNuevo;
  control.tenants.set(t.id, t);
  await persistirEstadoTenant(t.id, estadoNuevo);
  adminStore.eventosVida.push({ id: crypto.randomUUID(), tenantId: t.id, deEstado: de, aEstado: t.estado, motivo: (conf as { motivo: string }).motivo, actor: (admin as { googleSub: string }).googleSub, idempotencyKey: crypto.randomUUID(), creadoEn: new Date().toISOString() });
  auditar({ kind: parsed.data.accion === "suspender" ? "tenant_suspendido" : "tenant_reactivado", tenantId: t.id }, (admin as { googleSub: string }).googleSub, "panel");
  return Response.json({ tenant_id: t.id, estado: t.estado });
};
