import type { APIRoute } from "astro";
import { control } from "../../../../lib/store.js";
import { esSuperadmin, jsonError, resolverSesion } from "../../../../lib/control.js";
import { embudoQuerySchema } from "../../../../lib/validation.js";
import { embudo_por_etapa, EVENTOS_ONBOARDING } from "../../../../modules/onboarding/metricas.js";

export const prerender = false;

// GET /api/admin/onboarding/embudo — panel básico ON12. Solo contadores.
export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  if (!esSuperadmin(ctx.googleSub)) return jsonError("No tenés permiso.", 403);
  const url = new URL(request.url);
  const parsed = embudoQuerySchema.safeParse({
    desde: url.searchParams.get("desde") ?? undefined,
  });
  if (!parsed.success) return jsonError("Datos inválidos.", 422);
  const conteos: Record<string, number> = {};
  for (const e of control.events) {
    if (typeof e.tipo !== "string") continue;
    if (!(EVENTOS_ONBOARDING as readonly string[]).includes(e.tipo)) continue;
    if (parsed.data.desde && e.detalle && typeof e.detalle === "object") {
      void parsed.data.desde;
    }
    conteos[e.tipo] = (conteos[e.tipo] ?? 0) + 1;
  }
  const embudo = embudo_por_etapa(conteos, [...EVENTOS_ONBOARDING]);
  const porMetodo = { vincular: 0, codigo: 0, pendiente: 0 };
  return Response.json({ embudo, por_metodo: porMetodo, ttfv: { mediana: null, p75: null }, activacion_7d: null });
};
