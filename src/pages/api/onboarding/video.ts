import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { videoProgresoSchema } from "../../../lib/validation.js";
import { registrarVideo } from "../../../modules/onboarding/onboarding.js";

export const prerender = false;

const TIPO_EVENTO = {
  inicio: "video_inicio",
  mitad: "video_50",
  fin: "video_fin",
} as const;

// POST /api/onboarding/video — medición propia ON6.6 (inicio, 50%, fin).
// Guarda el progreso por usuario y comercio sin bloquear la reproducción.
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = videoProgresoSchema.safeParse(body);
  if (!parsed.success) return jsonError("Datos inválidos.", 422);
  const m = membershipActiva(parsed.data.tenant_id, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const next = registrarVideo(
    ctx.googleSub,
    parsed.data.tenant_id,
    parsed.data.progreso,
    parsed.data.evento,
  );
  control.events.push({
    tenantId: parsed.data.tenant_id,
    tipo: TIPO_EVENTO[parsed.data.evento],
    actor: ctx.googleSub,
    detalle: { progreso: next.videoProgreso },
    creadoEn: new Date().toISOString(),
  });
  return Response.json({ ok: true, visto: next.videoVisto, progreso: next.videoProgreso });
};
