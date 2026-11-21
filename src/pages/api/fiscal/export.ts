import type { APIRoute } from "astro";
import { listarFiscalDocs } from "../../../lib/repos/fiscal.js";
import { tenantDeRequest } from "../../../lib/tenant-context.js";
import { filtrar_historial, historial_a_csv } from "../../../modules/fiscal/historial.js";

export const prerender = false;

// ISO-S4: el tenant lo resuelve el servidor y todo se filtra por él (DB y memoria).
export const GET: APIRoute = async ({ url, request }) => {
  const t = tenantDeRequest(request);
  if (!t.ok) return t.respuesta;
  if ((request.headers.get("X-Rol") ?? "dueno") !== "dueno") {
    return Response.json({ error: "Solo el dueño puede exportar." }, { status: 403 });
  }
  const formato = url.searchParams.get("formato") ?? "csv";
  if (formato !== "csv") return Response.json({ error: "formato no soportado" }, { status: 422 });
  const docs = filtrar_historial(await listarFiscalDocs(t.tenantId), {
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
