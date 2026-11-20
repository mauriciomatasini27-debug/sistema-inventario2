import type { APIRoute } from "astro";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { tourPasoSchema } from "../../../lib/validation.js";
import { marcarTourPaso } from "../../../modules/onboarding/onboarding.js";

export const prerender = false;

// POST /api/onboarding/tour-paso — guarda el progreso sin bloquear la UI.
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = tourPasoSchema.safeParse(body);
  if (!parsed.success) return jsonError("Datos inválidos.", 422);
  const m = membershipActiva(parsed.data.tenant_id, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const next = marcarTourPaso(
    ctx.googleSub,
    parsed.data.tenant_id,
    parsed.data.paso,
    parsed.data.estado,
  );
  return Response.json({ ok: true, tour_estado: next.tourEstado, ultimo_paso: next.tourUltimoPaso });
};
