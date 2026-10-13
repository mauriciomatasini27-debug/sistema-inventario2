import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { leerFiscalDocs, soloDelTenant, unionFiscalDocs } from "../../../lib/fiscal-db.js";
import { tenantDeRequest } from "../../../lib/tenant-context.js";
import { filtrar_historial } from "../../../modules/fiscal/historial.js";

export const prerender = false;

// GET /api/fiscal/history — historial inmutable + filtros (FE-S25/FE13). Solo lectura.
// PERS-S4: con DB viva lee fiscal_documents; sin DB cae a memoria.
// ISO-S4: el tenant lo resuelve el servidor y todo se filtra por él (DB y memoria).
export const GET: APIRoute = async ({ request, url }) => {
  const t = tenantDeRequest(request);
  if (!t.ok) return t.respuesta;
  const memoria = soloDelTenant([...store.fiscalDocs.values()], t.tenantId);
  const dbDocs = await leerFiscalDocs(t.tenantId);
  const docs = filtrar_historial(dbDocs ? unionFiscalDocs(memoria, dbDocs) : memoria, {
    numero: url.searchParams.get("numero") ?? undefined,
    desde: url.searchParams.get("desde") ?? undefined,
    hasta: url.searchParams.get("hasta") ?? undefined,
    tipo: url.searchParams.get("tipo") ?? undefined,
    estado: url.searchParams.get("estado") ?? undefined,
    receptor: url.searchParams.get("receptor") ?? undefined,
  });
  return Response.json({ docs }, { status: 200 });
};
