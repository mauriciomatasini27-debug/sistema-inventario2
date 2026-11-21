import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { obtenerBalance } from "../../../lib/repos/caja.js";

export const prerender = false;

// PERS2-S12: el repo caja deriva desde cash_movements del tenant con DB
// viva y desde memoria particionada solo en single sin base. Nunca caché
export const GET: APIRoute = async () => {
  try {
    const b = await obtenerBalance();
    return Response.json({ por_medio: b.porMedio, total: b.total, fuente: b.fuente });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
