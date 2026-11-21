import type { APIRoute } from "astro";
import { control } from "../../../../lib/store.js";
import { exigirAdminMutante, exigirConfirmacion, leerJson } from "../_guard.js";
import { jsonError } from "../../../../lib/control.js";
import { suspenderPorMora } from "../_suspender.js";

export const prerender = false;

// POST /api/admin/mora/suspender — delega en suspenderPorMora (gracia 14 días,
// persistencia obligatoria). Admin NUNCA importa server-db ni schemas de negocio (PA3).
export const POST: APIRoute = async ({ request }) => {
  const admin = await exigirAdminMutante(request);
  if (admin instanceof Response) return admin;

  const parsed = await leerJson(request);
  if (parsed instanceof Response) return parsed;
  const tenantId = typeof parsed["tenant_id"] === "string" ? parsed["tenant_id"] : "";
  if (!control.tenants.get(tenantId)) return jsonError("Tenant desconocido.", 404);
  const conf = exigirConfirmacion(parsed, tenantId);
  if (conf instanceof Response) return conf;
  return suspenderPorMora({ tenantId, motivo: conf.motivo, actorSub: admin.googleSub });
};
