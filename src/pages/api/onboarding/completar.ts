import type { APIRoute } from "astro";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { control } from "../../../lib/store.js";
import { onboardingCompletarSchema } from "../../../lib/validation.js";
import { claveOnboarding, estadoInicial } from "../../../modules/onboarding/estado.js";

export const prerender = false;

// POST /api/onboarding/completar — marca el wizard como completado.
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = onboardingCompletarSchema.safeParse(body ?? {});
  if (!parsed.success) return jsonError("Datos inválidos.", 422);
  let tenantId: string | undefined = parsed.data.tenant_id;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    const ms = [...control.memberships.values()].filter(
      (m) => m.googleSub === ctx.googleSub && m.rol === "dueno" && m.estado === "activo",
    );
    if (ms.length === 0) return jsonError("No se encontró comercio.", 403);
    tenantId = ms[0]?.tenantId;
  }
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return jsonError("No se encontró comercio.", 403);
  }
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const clave = claveOnboarding(ctx.googleSub, tenantId);
  const previo = control.onboardingState.get(clave) ?? estadoInicial(ctx.googleSub, tenantId);
  const next = {
    ...previo,
    wizardCompletado: true,
    wizardPaso: 5,
    wizardEmpleados: parsed.data.empleados ?? previo.wizardEmpleados,
    actualizadoAt: new Date().toISOString(),
  };
  control.onboardingState.set(clave, next);
  return Response.json({ ok: true, completado: true });
};
