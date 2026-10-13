import type { APIRoute } from "astro";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { checklistSaltarSchema } from "../../../lib/validation.js";
import { control } from "../../../lib/store.js";
import { claveOnboarding, estadoInicial } from "../../../modules/onboarding/estado.js";

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
  const clave = claveOnboarding(ctx.googleSub, parsed.data.tenant_id);
  const previo = control.onboardingState.get(clave) ?? estadoInicial(ctx.googleSub, parsed.data.tenant_id);
  const next = { ...previo, actualizadoAt: new Date().toISOString() };
  if (parsed.data.accion === "saltar") {
    if (!next.pasosSaltados.includes(parsed.data.paso)) next.pasosSaltados.push(parsed.data.paso);
  } else if (parsed.data.accion === "retomar") {
    next.pasosSaltados = next.pasosSaltados.filter((p) => p !== parsed.data.paso);
  } else if (parsed.data.accion === "ocultar") {
    next.checklistOculta = true;
  } else {
    next.checklistOculta = false;
  }
  control.onboardingState.set(clave, next);
  return Response.json({ ok: true, oculta: next.checklistOculta, saltados: next.pasosSaltados });
};
