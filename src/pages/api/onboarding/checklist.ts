import type { APIRoute } from "astro";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { checklistSaltarSchema } from "../../../lib/validation.js";
import { accionChecklist } from "../../../modules/onboarding/onboarding.js";

export const prerender = false;

// POST /api/onboarding/checklist — saltar, retomar, ocultar o mostrar.
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = checklistSaltarSchema.safeParse(body);
  if (!parsed.success) return jsonError("Datos inválidos.", 422);
  const m = membershipActiva(parsed.data.tenant_id, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const next = accionChecklist(
    { userId: ctx.googleSub, tenantId: parsed.data.tenant_id },
    parsed.data.accion,
    parsed.data.paso,
  );
  return Response.json({ ok: true, oculta: next.checklistOculta, saltados: next.pasosSaltados });
};
