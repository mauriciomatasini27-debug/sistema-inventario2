import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { exigirOnlineParaSensible } from "../../../lib/offline-gate.js";
import { filtrar_historial, historial_a_csv, paginar, parsear_params } from "../../../modules/cash/historial.js";

export const prerender = false;

// GET /api/cash/export?tipo=&medio=&origen=&limit=&cursor= — C11 CSV.
// Mismos filtros y paginación que /api/cash/history. CSV UTF-8 con BOM,
// descarga adjunta. Solo lectura.
// SYNC-S7: export es sensible, exige online. Con grant offline / cuarentena => 403.
export const GET: APIRoute = async ({ url, request }) => {
  const bloqueo = exigirOnlineParaSensible(request, "export");
  if (bloqueo) return bloqueo;
  const p = parsear_params(url.searchParams);
  if (!p.ok) return Response.json({ error: p.error }, { status: 422 });
  const filtrados = filtrar_historial(store.movements, p.params);
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

// BOM explícito sin literales invisibles en el fuente.
const BOM = String.fromCharCode(0xfeff);
