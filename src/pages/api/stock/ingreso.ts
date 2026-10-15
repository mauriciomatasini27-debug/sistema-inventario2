import type { APIRoute } from "astro";
import { manejarIngresoLote } from "../../../lib/ingreso-lote.js";

export const prerender = false;

// POST /api/stock/ingreso — alias CAT-S3 de POST /api/lots (ADR-0026).
// Mismo cuerpo y mismos codigos. Sin logica propia.
export const POST: APIRoute = async ({ request }) => manejarIngresoLote(request);
