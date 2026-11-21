import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { listarMovimientos } from "../../../lib/repos/caja.js";
import { filtrar_historial, paginar, parsear_params } from "../../../modules/cash/historial.js";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const p = parsear_params(url.searchParams);
  if (!p.ok) return Response.json({ error: p.error }, { status: 422 });
  let movs: Awaited<ReturnType<typeof listarMovimientos>>;
  try {
    movs = await listarMovimientos();
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  const filtrados = filtrar_historial(movs, p.params);
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
