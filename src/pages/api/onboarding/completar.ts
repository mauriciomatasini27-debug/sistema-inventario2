import type { APIRoute } from "astro";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { persistirOnboarding } from "../../../lib/control-db.js";
import { onboardingCompletarSchema } from "../../../lib/validation.js";
import { completarWizardConRespuestas } from "../../../modules/onboarding/onboarding.js";
import { tenantDelCuestionario } from "../../../modules/onboarding/acceso-tenant.js";

export const prerender = false;

// ON12: marca el wizard completado y espera al espejo durable antes de responder.
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
  // TB-165 [tenant]: mismo criterio que GET /estado: el comercio lo fija la
  // sesión (o X-Tenant-Id); el body solo se acepta si coincide. Así un dueño
  // con dos comercios no graba en el otro por un fallback a la primera membresía.
  const autorizado = tenantDelCuestionario(
    request.headers.get("X-Tenant-Id") ?? ctx.tenantId ?? "",
    parsed.data.tenant_id ?? null,
  );
  if (!autorizado.ok) return jsonError("No tenés permiso en este comercio.", 403);
  const tenantId = autorizado.tenantId;
  const m = membershipActiva(tenantId, ctx.googleSub);
  // ON12: el flag es por comercio; solo el dueño puede marcarlo completo.
  if (!m || m.rol !== "dueno") return jsonError("No tenés permiso en este comercio.", 403);
  const next = completarWizardConRespuestas(
    { userId: ctx.googleSub, tenantId },
    parsed.data.respuestas,
    parsed.data.empleados,
  );
  // ON12: persistir antes de responder para sobrevivir al próximo deploy.
  // TB-165 [tenant]: se escriben también las respuestas, no sólo el flag y el paso.
  await persistirOnboarding(
    tenantId,
    next.wizardCompletado,
    next.wizardPaso,
    next.wizardRespuestas,
  );
  return Response.json({ ok: true, completado: true });
};
