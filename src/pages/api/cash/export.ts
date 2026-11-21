import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { exigirOnlineParaSensible } from "../../../lib/offline-gate.js";
import { listarMovimientos } from "../../../lib/repos/caja.js";
import { filtrar_historial, historial_a_csv, paginar, parsear_params } from "../../../modules/cash/historial.js";

export const prerender = false;

export const GET: APIRoute = async ({ url, request }) => {
  const bloqueo = exigirOnlineParaSensible(request, "export");
  if (bloqueo) return bloqueo;
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
  const { pagina } = paginar(filtrados, p.params.cursor, p.params.limit);
  const csv = BOM + historial_a_csv(pagina);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="caja-historial.csv"',
    },
  });
};

const BOM = String.fromCharCode(0xfeff);
