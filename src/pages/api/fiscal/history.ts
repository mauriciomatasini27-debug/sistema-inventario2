import type { APIRoute } from "astro";
import { listarFiscalDocs } from "../../../lib/repos/fiscal.js";
import { tenantDeRequest } from "../../../lib/tenant-context.js";
import { filtrar_historial } from "../../../modules/fiscal/historial.js";

export const prerender = false;

// PERS2-S8: el repo fiscal lee fiscal_documents del tenant con fallback a memoria en single.
// ISO-S4: el tenant lo resuelve el servidor y todo se filtra por él (DB y memoria).
export const GET: APIRoute = async ({ request, url }) => {
  const t = tenantDeRequest(request);
  if (!t.ok) return t.respuesta;
  const docs = filtrar_historial(await listarFiscalDocs(t.tenantId), {
    numero: url.searchParams.get("numero") ?? undefined,
    desde: url.searchParams.get("desde") ?? undefined,
    hasta: url.searchParams.get("hasta") ?? undefined,
    tipo: url.searchParams.get("tipo") ?? undefined,
    estado: url.searchParams.get("estado") ?? undefined,
    receptor: url.searchParams.get("receptor") ?? undefined,
  });
  return Response.json({ docs }, { status: 200 });
};
