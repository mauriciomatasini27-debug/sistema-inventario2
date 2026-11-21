import type { APIRoute } from "astro";
import { fiscalRetrySchema } from "../../../lib/validation.js";
import {
  buscarFiscalDocPorId,
  reencolarDoc,
} from "../../../lib/repos/fiscal.js";

export const prerender = false;

// PERS2-S8: el repo fiscal resuelve DB-first con backfill desde memoria y
// espejo memoria; sin base queda en memoria como antes.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = fiscalRetrySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const corr = {
    ...(b.correccion_doc_nro !== undefined ? { docNro: b.correccion_doc_nro } : {}),
    ...(b.correccion_cond_iva !== undefined ? { condIva: String(b.correccion_cond_iva) } : {}),
  };

  const doc = await buscarFiscalDocPorId(b.fiscal_document_id);
  if (!doc) return Response.json({ error: "documento inexistente" }, { status: 404 });
  if (doc.no_facturar) return Response.json({ error: "cerrado como no facturar" }, { status: 422 });
  if (doc.estado !== "rechazado" && doc.estado !== "pendiente") {
    return Response.json({ error: `estado ${doc.estado} no reintentable` }, { status: 422 });
  }

  const r = await reencolarDoc(b.fiscal_document_id, corr);
  if (!r.ok) {
    if (r.codigo === "inexistente") return Response.json({ error: "documento inexistente" }, { status: 404 });
    if (r.codigo === "no-facturar") return Response.json({ error: "cerrado como no facturar" }, { status: 422 });
    return Response.json({ error: `estado ${r.doc?.estado} no reintentable` }, { status: 422 });
  }
  return Response.json({ fiscal_estado: "pendiente", intentos: r.doc.intentos }, { status: 200 });
};
