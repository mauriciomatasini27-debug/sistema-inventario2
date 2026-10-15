import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { listarLotesDetalle } from "../../lib/repos/lotes.js";
import { manejarIngresoLote } from "../../lib/ingreso-lote.js";

export const prerender = false;

// POST /api/lots — CAT-S3 ingreso + FEFO auto.
// Si controla_vencimiento y sin vence_el => 422. Idempotente por key.
// PERS2-S23: el lote va por el repo de lotes y el movimiento ALTA solo por
// stock.ts. En multi sin base el repo propaga BaseNoDisponible (503).
export const POST: APIRoute = async ({ request }) => manejarIngresoLote(request);

// GET /api/lots?sku= — lista orden FEFO (vence_el ASC, nulls last).
export const GET: APIRoute = async ({ url }) => {
  const sku = (url.searchParams.get("sku") ?? "").trim().toUpperCase();
  try {
    return Response.json({ lotes: await listarLotesDetalle(sku || null) });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
