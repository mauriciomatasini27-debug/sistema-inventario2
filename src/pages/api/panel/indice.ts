import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { planIncluye } from "../../../lib/repos/planes.js";
import { featuresDelIndice, indicePanel, type FeaturesPlan } from "../../../lib/panel-modulos.js";

export const prerender = false;

// DASH-S12 (PRD-DASH-01, ADR-0020): índice de /panel según el plan del tenant.
// El tenant y el rol salen de la sesión + membership activa, nunca del request.
// Los módulos encendidos y sus condiciones viven en MODULOS_INDICE.

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  try {
    const features: FeaturesPlan = {};
    for (const feature of featuresDelIndice()) {
      features[feature] = (await planIncluye(tenantId, feature)).incluida;
    }
    return Response.json({ modulos: indicePanel(features) });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
