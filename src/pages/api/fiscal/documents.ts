import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { leerFiscalDocs, soloDelTenant, unionFiscalDocs } from "../../../lib/fiscal-db.js";
import { tenantDeRequest } from "../../../lib/tenant-context.js";

export const prerender = false;

// GET /api/fiscal/documents — lectura + bandeja (ADR-0019 + FE-S20/S25). Sin edición.
// PERS-S4: con DB viva lee fiscal_documents; sin DB cae a memoria.
// ISO-S4: el tenant lo resuelve el servidor y todo se filtra por él (DB y memoria).
export const GET: APIRoute = async ({ request, url }) => {
  const t = tenantDeRequest(request);
  if (!t.ok) return t.respuesta;
  const saleId = url.searchParams.get("sale_id") ?? "";
  const numero = url.searchParams.get("numero") ?? "";
  const tipo = url.searchParams.get("tipo") ?? "";
  const estado = url.searchParams.get("estado") ?? "";
  const receptor = url.searchParams.get("receptor") ?? "";
  const memoria = soloDelTenant([...store.fiscalDocs.values()], t.tenantId);
  const dbDocs = await leerFiscalDocs(t.tenantId);
  let docs = dbDocs ? unionFiscalDocs(memoria, dbDocs) : memoria;
  if (saleId) docs = docs.filter((d) => d.sale_id === saleId);
  if (numero) docs = docs.filter((d) => `${d.pto_vta}-${d.cbte_nro ?? ""}` === numero || d.idempotency_key === numero);
  if (tipo) docs = docs.filter((d) => d.cbte_tipo === tipo);
  if (estado) docs = docs.filter((d) => d.estado === estado);
  if (receptor) docs = docs.filter((d) => d.doc_nro === receptor);
  if (!saleId && !numero && !tipo && !estado && !receptor) {
    return Response.json({ error: "falta filtro (sale_id, numero, tipo, estado o receptor)" }, { status: 422 });
  }
  return Response.json({ docs }, { status: 200 });
};
