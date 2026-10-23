import type { APIRoute } from "astro";
import { resolverSesion, membershipActiva } from "../../../lib/control.js";
import { historialAlertasStock } from "../../../lib/repos/whatsapp.js";

export const prerender = false;

// GET /api/alertas/historial — DASH-S6 (ADR-0043). Solo Dueño: exige sesión
// con comercio y membership activa con rol dueno; Empleado ve 403.
export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx?.tenantId) return Response.json({ error: "Iniciá sesión para ver el historial." }, { status: 401 });
  const m = membershipActiva(ctx.tenantId, ctx.googleSub);
  if (!m || m.rol !== "dueno") {
    return Response.json({ error: "Solo el dueño puede ver el historial de alertas." }, { status: 403 });
  }
  const alertas = await historialAlertasStock(ctx.tenantId);
  return Response.json(
    {
      alertas: alertas.map(({ sku, nombre, stock, umbral, urgente, fecha, canal, estado }) => ({
        sku,
        nombre,
        stock,
        umbral,
        urgente,
        fecha,
        canal,
        estado,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
