import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { leerFiscalDocs, unionFiscalDocs } from "../../../lib/fiscal-db.js";
import { filtrar_historial } from "../../../modules/fiscal/historial.js";

export const prerender = false;

// GET /api/fiscal/history — historial inmutable + filtros (FE-S25/FE13). Solo lectura.
// PERS-S4: con DB viva lee fiscal_documents; sin DB cae a memoria.
export const GET: APIRoute = async ({ url }) => {
  const dbDocs = await leerFiscalDocs();
  const docs = filtrar_historial(dbDocs ? unionFiscalDocs([...store.fiscalDocs.values()], dbDocs) : [...store.fiscalDocs.values()], {
    numero: url.searchParams.get("numero") ?? undefined,
    desde: url.searchParams.get("desde") ?? undefined,
    hasta: url.searchParams.get("hasta") ?? undefined,
    tipo: url.searchParams.get("tipo") ?? undefined,
    estado: url.searchParams.get("estado") ?? undefined,
    receptor: url.searchParams.get("receptor") ?? undefined,
  });
  return Response.json({ docs }, { status: 200 });
};
