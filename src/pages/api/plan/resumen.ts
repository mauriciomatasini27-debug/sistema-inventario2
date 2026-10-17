import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { leerCatalogo, leerSuscripcionActiva } from "../../../lib/repos/planes.js";
import { crearRegistroUsoIA } from "../../../lib/repos/ia-uso.js";
import { fechaAR, mesAR } from "../../../lib/fecha-ar.js";
import { vistaPlan } from "../../../lib/plan-panel.js";

export const prerender = false;

// DASH-S8 (PRD-DASH-01, ADR-0045): resumen read-only de /panel/plan. El tenant
// sale de la sesión + membership activa, nunca del request. No devuelve precios
// (el catálogo es de referencia) ni datos de otro comercio. Vive bajo /api/plan
// (PREFIJOS_DATOS) para que el middleware fije la base del tenant.

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
  if (!membershipActiva(tenantId, ctx.googleSub)) return jsonError("No tenés permiso en este comercio.", 403);

  const ahora = new Date();
  try {
    const activa = await leerSuscripcionActiva(tenantId);
    const catalogo = await leerCatalogo();
    const uso = await crearRegistroUsoIA().usoDelMes(tenantId, mesAR(ahora));
    return Response.json(
      vistaPlan({
        planId: activa?.planId ?? null,
        catalogo,
        consultasAsistenteMes: uso.consultas,
        hoy: fechaAR(ahora),
      }),
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
