import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { leerFiscalDocs, unionFiscalDocs } from "../../../lib/fiscal-db.js";

export const prerender = false;

// GET /api/fiscal/documents — lectura + bandeja (ADR-0019 + FE-S20/S25). Sin edición.
// PERS-S4: con DB viva lee fiscal_documents; sin DB cae a memoria.
export const GET: APIRoute = async ({ url }) => {
  const saleId = url.searchParams.get("sale_id") ?? "";
  const numero = url.searchParams.get("numero") ?? "";
  const tipo = url.searchParams.get("tipo") ?? "";
  const estado = url.searchParams.get("estado") ?? "";
  const receptor = url.searchParams.get("receptor") ?? "";
  const dbDocs = await leerFiscalDocs();
  let docs = dbDocs ? unionFiscalDocs([...store.fiscalDocs.values()], dbDocs) : [...store.fiscalDocs.values()];
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
