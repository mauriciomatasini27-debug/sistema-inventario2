import type { APIRoute } from "astro";
import { matchearBorrador, type OrdenMatchable } from "../../../modules/purchases/matching.js";
import { store } from "../../../lib/store.js";
import { dbVivaTenant } from "../../../lib/server-db.js";
import { leerBorradorPorId, leerOrdenesDb, unionOrdenes } from "../../../lib/compras-db.js";

export const prerender = false;

function responder(
  draftId: string,
  cuit: string,
  totalCentavos: bigint,
  ordenes: ReadonlyArray<OrdenMatchable>,
): Response {
  const r = matchearBorrador({ draftId, cuit, totalCentavos, ordenes, ahoraIso: new Date().toISOString() });
  return Response.json({
    candidatos: r.candidatos.map((c) => ({ order_id: c.orderId, diferencia_centavos: c.diferenciaCentavos.toString() })),
    intentos: r.log.length,
  });
}

// POST /api/supplier-invoices/match — matching borrador vs OCs (FP, tolerancia 1%).
// Solo lectura: el log durable lo escribe el confirm al vincular.
// PERS-S4: DB-first. Con memoria fría se lee borrador + OCs desde DB
// (unión con memoria por altas durante cortes). Sin DB o ante error,
// memoria como antes.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const draftId = (body as { draft_id?: unknown }).draft_id;
  if (typeof draftId !== "string" || !draftId) {
    return Response.json({ error: "falta draft_id" }, { status: 422 });
  }
  const enMemoria = store.borradores.get(draftId);
  const db = dbVivaTenant();
  if (!db) {
    if (!enMemoria) return Response.json({ error: "borrador inexistente" }, { status: 404 });
    if (enMemoria.cuit === null || enMemoria.totalCentavos === null) {
      return Response.json({ error: "borrador sin cuit o total" }, { status: 422 });
    }
    return responder(
      enMemoria.id,
      enMemoria.cuit,
      enMemoria.totalCentavos,
      [...store.purchaseOrders.values()].map((o) => ({
        id: o.id,
        supplierCuit: o.supplierCuit,
        estado: o.estado,
        totalCentavos: o.totalCentavos,
      })),
    );
  }

  try {
    const borrador = enMemoria ?? (await leerBorradorPorId(db, draftId))?.borrador ?? null;
    if (!borrador) return Response.json({ error: "borrador inexistente" }, { status: 404 });
    if (borrador.cuit === null || borrador.totalCentavos === null) {
      return Response.json({ error: "borrador sin cuit o total" }, { status: 422 });
    }
    return responder(
      borrador.id,
      borrador.cuit,
      borrador.totalCentavos,
      unionOrdenes(store.purchaseOrders.values(), await leerOrdenesDb(db)),
    );
  } catch {
    if (!enMemoria) return Response.json({ error: "borrador inexistente" }, { status: 404 });
    if (enMemoria.cuit === null || enMemoria.totalCentavos === null) {
      return Response.json({ error: "borrador sin cuit o total" }, { status: 422 });
    }
    return responder(
      enMemoria.id,
      enMemoria.cuit,
      enMemoria.totalCentavos,
      [...store.purchaseOrders.values()].map((o) => ({
        id: o.id,
        supplierCuit: o.supplierCuit,
        estado: o.estado,
        totalCentavos: o.totalCentavos,
      })),
    );
  }
};
