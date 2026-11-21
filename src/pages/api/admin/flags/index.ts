import type { APIRoute } from "astro";
import { control } from "../../../../lib/store.js";
import { adminStore } from "../../../../lib/admin-store.js";
import { persistirOverrideAdmin } from "../../../../lib/admin-db.js";
import { exigirAdminMutante, auditar, exigirAdminListo, leerJson } from "../_guard.js";
import { jsonError } from "../../../../lib/control.js";
import { resolver_flag } from "../../../../modules/admin/flags.js";

export const prerender = false;

// /api/admin/flags — overrides por tenant (PA12). Motivo obligatorio.
// GET lista resueltos (default del plan + override); POST crea/actualiza.
export const GET: APIRoute = async ({ request }) => {
  const admin = await exigirAdminListo(request);
  if (admin instanceof Response) return admin;

  const tenantId = new URL(request.url).searchParams.get("tenant_id") ?? "";
  const lista = [...adminStore.overrides.values()]
    .filter((o) => !tenantId || o.tenantId === tenantId)
    .map((o) => ({ ...o, resuelto: resolver_flag({ defaultPlan: false, override: o }) }));
  return Response.json({ flags: lista }, { status: 200 });
};

export const POST: APIRoute = async ({ request }) => {
  const admin = await exigirAdminMutante(request);
  if (admin instanceof Response) return admin;

  const parsed = await leerJson(request);
  if (parsed instanceof Response) return parsed;
  const tenantId = typeof parsed["tenant_id"] === "string" ? parsed["tenant_id"] : "";
  if (!control.tenants.get(tenantId)) return jsonError("No tenés permiso para ver el panel.", 403);
  const flag = typeof parsed["flag"] === "string" ? parsed["flag"].trim() : "";
  const motivo = typeof parsed["motivo"] === "string" ? parsed["motivo"].trim() : "";
  if (!flag) return jsonError("El flag es obligatorio.", 422);
  if (!motivo) return jsonError("El motivo es obligatorio.", 422);
  if (typeof parsed["valor"] !== "boolean") return jsonError("valor debe ser true o false.", 422);
  const expiraEn = typeof parsed["expira_en"] === "string" ? parsed["expira_en"] : null;
  if (expiraEn && Number.isNaN(new Date(expiraEn).getTime())) {
    return jsonError("expira_en inválida.", 422);
  }

  const override = {
    tenantId,
    flag,
    valor: parsed["valor"] as boolean,
    motivo,
    expiraEn,
    creadoPor: admin.googleSub,
    creadoEn: new Date().toISOString(),
  };
  adminStore.overrides.set(`${tenantId}:${flag}`, override);
  void persistirOverrideAdmin({ ...override });
  auditar({ kind: "flag_resuelto", tenantId, flag, valor: override.valor }, admin.googleSub, "panel");
  return Response.json(
    { flag, resuelto: resolver_flag({ defaultPlan: false, override }) },
    { status: 200 },
  );
};
