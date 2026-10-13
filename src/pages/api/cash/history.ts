import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { filtrar_historial, paginar, parsear_params } from "../../../modules/cash/historial.js";

export const prerender = false;

// GET /api/cash/history?tipo=&medio=&origen=&limit=&cursor= — C11 historial.
// Solo lectura sobre movimientos append-only, más recientes primero.
// montos en string de centavos (bigint serializado en el borde).
export const GET: APIRoute = async ({ url }) => {
  const p = parsear_params(url.searchParams);
  if (!p.ok) return Response.json({ error: p.error }, { status: 422 });
  const filtrados = filtrar_historial(store.movements, p.params);
  const { pagina, nextCursor } = paginar(filtrados, p.params.cursor, p.params.limit);
  return Response.json({
    items: pagina.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      metodo: m.metodo,
      monto_centavos: m.monto_centavos,
      origen: m.origen,
      ...(m.sale_id !== undefined ? { sale_id: m.sale_id } : {}),
      idempotency_key: m.idempotency_key,
    })),
    total: filtrados.length,
    next_cursor: nextCursor,
  });
};
