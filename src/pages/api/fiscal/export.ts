import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { leerFiscalDocs, unionFiscalDocs } from "../../../lib/fiscal-db.js";
import { filtrar_historial, historial_a_csv } from "../../../modules/fiscal/historial.js";

export const prerender = false;

// GET /api/fiscal/export?formato=csv — CSV mensual (FE-S25). Dueño via X-Rol slice homo.
export const GET: APIRoute = async ({ url, request }) => {
  if ((request.headers.get("X-Rol") ?? "dueno") !== "dueno") {
    return Response.json({ error: "Solo el dueño puede exportar." }, { status: 403 });
  }
  const formato = url.searchParams.get("formato") ?? "csv";
  if (formato !== "csv") return Response.json({ error: "formato no soportado" }, { status: 422 });
  const dbDocs = await leerFiscalDocs();
  const docs = filtrar_historial(dbDocs ? unionFiscalDocs([...store.fiscalDocs.values()], dbDocs) : [...store.fiscalDocs.values()], {
    desde: url.searchParams.get("desde") ?? undefined,
    hasta: url.searchParams.get("hasta") ?? undefined,
    tipo: url.searchParams.get("tipo") ?? undefined,
  });
  if (docs.length > 2000) return Response.json({ error: "demasiadas filas, acotá el rango", pendiente: true }, { status: 202 });
  return new Response(historial_a_csv(docs), {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=fiscal.csv" },
  });
};
