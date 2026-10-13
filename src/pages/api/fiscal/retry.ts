import type { APIRoute } from "astro";
import { fiscalRetrySchema } from "../../../lib/validation.js";
import { store, type StoredFiscalDoc } from "../../../lib/store.js";
import {
  asegurarFiscalDoc,
  dbViva,
  leerFiscalDocPorId,
  persistirFiscalDoc,
  reencolarFiscalDoc,
} from "../../../lib/fiscal-db.js";

export const prerender = false;

// POST /api/fiscal/retry — reencola rechazada tras corregir (ADR-0018 + FE-S20).
// PERS-S4 G2a: DB-first. Lookup en unión (memoria caliente + DB fría) y
// reencolado en 1 UPDATE atómico con re-chequeo de estado: el perdedor de una
// carrera relee y recibe el motivo exacto. Espejo memoria tras el UPDATE. Sin
// DB o ante caída, la vía memoria histórica resuelve igual que antes.
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

  const db = dbViva();
  const memDoc = [...store.fiscalDocs.values()].find((d) => d.id === b.fiscal_document_id) ?? null;
  let doc = memDoc;
  if (!doc && db) {
    try {
      doc = await leerFiscalDocPorId(db, b.fiscal_document_id);
    } catch {
      doc = null;
    }
  }
  if (!doc) return Response.json({ error: "documento inexistente" }, { status: 404 });
  if (doc.no_facturar) return Response.json({ error: "cerrado como no facturar" }, { status: 422 });
  if (doc.estado !== "rechazado" && doc.estado !== "pendiente") {
    return Response.json({ error: `estado ${doc.estado} no reintentable` }, { status: 422 });
  }

  if (!db) return viaMemoria(doc, corr);

  try {
    let r = await reencolarFiscalDoc(db, b.fiscal_document_id, corr);
    if (!r.ok && r.codigo === "inexistente" && memDoc) {
      // Backfill (patrón F2): el doc nació en memoria durante un corte; se
      // inserta con su estado original y se reintenta el UPDATE.
      await asegurarFiscalDoc(memDoc);
      r = await reencolarFiscalDoc(db, b.fiscal_document_id, corr);
    }
    if (!r.ok) {
      if (r.doc) store.fiscalDocs.set(r.doc.idempotency_key, r.doc);
      if (r.codigo === "inexistente") return Response.json({ error: "documento inexistente" }, { status: 404 });
      if (r.codigo === "no-facturar") return Response.json({ error: "cerrado como no facturar" }, { status: 422 });
      return Response.json({ error: `estado ${r.doc.estado} no reintentable` }, { status: 422 });
    }
    store.fiscalDocs.set(r.doc.idempotency_key, r.doc);
    return Response.json({ fiscal_estado: "pendiente", intentos: r.doc.intentos }, { status: 200 });
  } catch {
    // Caída de DB a mitad de camino: el reintento no se pierde, queda en memoria.
    return viaMemoria(doc, corr);
  }
};

function viaMemoria(doc: StoredFiscalDoc, corr: { docNro?: string; condIva?: string }) {
  const actualizado = {
    ...doc,
    estado: "pendiente" as const,
    intentos: (doc.intentos ?? 0) + 1,
    proximo_intento: null,
    ultimo_error_codigo: null,
    motivo_castellano: null,
    ...(corr.docNro !== undefined ? { doc_nro: corr.docNro } : {}),
    ...(corr.condIva !== undefined ? { cond_iva_receptor: corr.condIva } : {}),
  };
  store.fiscalDocs.set(doc.idempotency_key, actualizado);
  // Best-effort histórico: la tabla es append-only (gana el primero).
  void persistirFiscalDoc(actualizado);
  return Response.json({ fiscal_estado: "pendiente", intentos: actualizado.intentos }, { status: 200 });
}
