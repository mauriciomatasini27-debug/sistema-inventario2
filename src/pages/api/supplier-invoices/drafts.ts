import type { APIRoute } from "astro";
import { draftIngestSchema } from "../../../lib/validation.js";
import { ingerirBorrador } from "../../../modules/purchases/facturas.js";
import { store } from "../../../lib/store.js";
import { dbVivaTenant } from "../../../lib/server-db.js";
import { itemsADb, leerBorradorPorKey } from "../../../lib/compras-db.js";
import { supplierDrafts } from "../../../db/schema-proveedores.js";

export const prerender = false;

// POST /api/supplier-invoices/drafts — ingesta FP (foto bot -> OCR sugerencia).
// Borrador MUTABLE; clave repetida => 200 con existente (E2).
// PERS-S4: DB-first. Pre-check por idempotency-key → 200 con existente aunque
// la memoria esté fría; espejo memoria tras el insert. Sin DB o ante error,
// la vía memoria histórica resuelve igual que antes.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = draftIngestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const ahoraIso = new Date().toISOString();
  const r = ingerirBorrador({
    idempotencyKey: key,
    origen: b.origen,
    bytesRef: b.bytes_ref,
    esComprobante: b.es_comprobante,
    ...(b.cuit_texto !== undefined ? { cuitTexto: b.cuit_texto } : {}),
    ...(b.nombre_proveedor !== undefined ? { nombreProveedor: b.nombre_proveedor } : {}),
    ...(b.fecha_texto !== undefined ? { fechaTexto: b.fecha_texto } : {}),
    ...(b.total_texto !== undefined ? { totalTexto: b.total_texto } : {}),
    fotoPendiente: b.foto_pendiente,
    ahoraIso,
    vistos: store.borradorVistos,
  });
  if (r.status === 415 || r.status === 422) return Response.json({ error: r.error }, { status: r.status });
  if (r.status === 200) {
    store.borradorVistos.set(key, r.borrador);
    store.borradores.set(r.borrador.id, r.borrador);
    return Response.json({ draft_id: r.borrador.id, duplicado: true }, { status: 200 });
  }

  const espejo = () => {
    store.borradorVistos.set(key, r.borrador);
    store.borradores.set(r.borrador.id, r.borrador);
  };

  const db = dbVivaTenant();
  if (!db) {
    espejo();
    return Response.json({ draft_id: r.borrador.id, aviso_revisar: r.avisoRevisar }, { status: 201 });
  }

  try {
    const previo = await leerBorradorPorKey(db, key);
    if (previo) {
      store.borradorVistos.set(key, previo.borrador);
      store.borradores.set(previo.borrador.id, previo.borrador);
      return Response.json({ draft_id: previo.borrador.id, duplicado: true }, { status: 200 });
    }
    await db
      .insert(supplierDrafts)
      .values({
        idempotencyKey: key,
        origen: r.borrador.origen,
        bytesRef: r.borrador.bytesRef,
        cuit: r.borrador.cuit,
        nombreProveedor: r.borrador.nombreProveedor,
        fechaIso: r.borrador.fechaIso,
        totalCentavos: r.borrador.totalCentavos,
        items: itemsADb(r.borrador.items),
        confianza: { ...r.borrador.confianza },
        estado: r.borrador.estado,
        fotoPendiente: r.borrador.fotoPendiente,
        confirmadoPor: null,
        facturaId: null,
        createdAt: new Date(r.borrador.creadoEn),
        venceAt: new Date(r.borrador.venceAt),
      })
      .onConflictDoNothing({ target: supplierDrafts.idempotencyKey })
      .returning({ id: supplierDrafts.id });
    // Carrera entre pre-check e insert: si el rival ganó, 200 con existente.
    const carrera = await leerBorradorPorKey(db, key);
    if (carrera && carrera.borrador.bytesRef !== r.borrador.bytesRef) {
      store.borradorVistos.set(key, carrera.borrador);
      store.borradores.set(carrera.borrador.id, carrera.borrador);
      return Response.json({ draft_id: carrera.borrador.id, duplicado: true }, { status: 200 });
    }
    espejo();
    return Response.json({ draft_id: r.borrador.id, aviso_revisar: r.avisoRevisar, fuente: "db" }, { status: 201 });
  } catch {
    espejo();
    return Response.json({ draft_id: r.borrador.id, aviso_revisar: r.avisoRevisar }, { status: 201 });
  }
};
