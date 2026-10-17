import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { armarVinculosPanel } from "../../../modules/whatsapp/vinculos-panel.js";
import { VINCULAR_TTL_MIN } from "../../../modules/whatsapp/vincular.js";

export const prerender = false;

// DASH-S1 (ADR-0039/0041): estado de vinculación por persona para la pantalla
// /panel/bot/config. Read-only y plano de control: el tenant y el rol salen de
// la sesión + membership, nunca del body. No toca la base del comercio.

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
  const personas = armarVinculosPanel({
    tenantId,
    googleSub: ctx.googleSub,
    esDueno: m.rol === "dueno",
    memberships: [...control.memberships.values()],
    users: control.users,
    botLinks: [...control.botLinks.entries()].map(([numeroE164, l]) => ({
      numeroE164,
      tenantId: l.tenantId,
      googleSub: l.googleSub,
      estado: l.estado,
    })),
    vincularCodes: [...control.vincularCodes.entries()].map(([numero, c]) => ({
      numero,
      tenantId: c.tenantId,
      googleSub: c.googleSub,
      expiraEn: c.expiraEn,
      usado: c.usado,
    })),
    waPrefs: control.waPrefs,
    ahoraMs: Date.now(),
  });
  return Response.json({
    tenant_id: tenantId,
    es_dueno: m.rol === "dueno",
    ttl_min: VINCULAR_TTL_MIN,
    personas,
  });
};
