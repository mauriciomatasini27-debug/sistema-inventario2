import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { leerResumenPanel } from "../../../lib/repos/panel.js";
import { construirResumen } from "../../../lib/panel-resumen.js";

export const prerender = false;

// GET /api/sales/resumen — agregados read-only del panel (P3-7c, ADR-0020).
// Reemplaza los números `demo` calculados en cliente: tickets de hoy, stock
// bajo, ventas del mes y por mes, composición por medio, heatmap de 28 días y
// turnos de hoy. Vive bajo /api/sales (PREFIJOS_DATOS): el middleware ya fija
// el tenant. En multi sin base el repo propaga BaseNoDisponible -> 503.
export const GET: APIRoute = async () => {
  try {
    const { datos, fuente } = await leerResumenPanel();
    return Response.json({ ...construirResumen(new Date(), datos), fuente });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
