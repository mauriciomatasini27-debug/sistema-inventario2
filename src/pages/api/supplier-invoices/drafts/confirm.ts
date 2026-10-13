import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { draftResolveSchema } from "../../../../lib/validation.js";
import { confirmarBorrador, type Borrador, type Factura } from "../../../../modules/purchases/facturas.js";
import { vincular_auto, type MatchLogEntry } from "../../../../modules/purchases/matching.js";
import { cerrarOrden } from "../../../../modules/purchases/proveedores.js";
import { store } from "../../../../lib/store.js";
import {
  dbViva,
  itemsADb,
  leerBorradorPorId,
  leerBorradorPorKey,
  leerOrdenCompleta,
  leerOrdenesDb,
  unionOrdenes,
  type TenantDb,
} from "../../../../lib/compras-db.js";
import {
  purchaseOrders,
  supplierDrafts,
  supplierInvoices,
  supplierMatchLog,
} from "../../../../db/schema-proveedores.js";

export const prerender = false;

// Centinela: el borrador se resolvió entre la validación y la tx (carrera o
// replay en frío). La tx revierte y la ruta responde 409.
const RESUELTO = { resuelto: true };

// POST /api/supplier-invoices/drafts/confirm — confirma 1 toque (E1/E5).
// ÚNICO camino que registra factura; alimenta cost_history vía descriptores.
// PERS-S4: DB-first. Factura + actualización del borrador + match log + cierre
// de la OC vinculada entran en 1 tx con la fila del borrador bloqueada; el
// espejo memoria se sincroniza después. Sin DB o ante error, la vía memoria
// histórica resuelve igual que antes.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = draftResolveSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const ahoraIso = new Date().toISOString();

  const db = dbViva();
  const enMemoria = store.borradores.get(b.draft_id);
  const base: Borrador | null =
    enMemoria ?? (db ? ((await leerBorradorPorId(db, b.draft_id))?.borrador ?? null) : null);
  if (!base) return Response.json({ error: "borrador inexistente" }, { status: 404 });
  const r = confirmarBorrador(base, { quien: b.quien, ahoraIso });
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });

  if (!db) {
    return confirmarEnMemoria(r.borrador, r.factura, r.avisoRevisar, b.quien, ahoraIso);
  }

  try {
    const filaDraft = await asegurarFilaBorrador(db, base);
    const ordenesDb = await leerOrdenesDb(db);
    const ordenes = unionOrdenes(store.purchaseOrders.values(), ordenesDb);
    const uuidPorOrden = new Map(ordenesDb.map((o) => [o.matchable.id, o.uuid]));
    const m =
      r.borrador.cuit !== null && r.borrador.totalCentavos !== null
        ? vincular_auto({
            draftId: r.borrador.id,
            cuit: r.borrador.cuit,
            totalCentavos: r.borrador.totalCentavos,
            ordenes,
            ahoraIso,
          })
        : null;

    let vinculadaId: string | null = null;
    let vinculoMotivo = "borrador sin cuit o total";
    if (m) {
      vinculoMotivo = m.motivo;
      const candidato = m.vinculado?.orderId ?? null;
      const uuid = candidato ? (uuidPorOrden.get(candidato) ?? null) : null;
      if (candidato && !uuid) {
        // OC solo en memoria (alta durante un corte): cierre histórico.
        const oc = store.purchaseOrders.get(candidato);
        if (oc !== undefined && oc.estado === "abierta") {
          const c = cerrarOrden(oc, b.quien, ahoraIso);
          if (c.ok) {
            store.purchaseOrders.set(oc.id, c.orden);
            vinculadaId = oc.id;
          } else {
            vinculoMotivo = "orden ya no abierta";
          }
        } else {
          vinculoMotivo = "orden ya no abierta";
        }
      }
    }

    await db.transaction(async (tx) => {
      const bloq = await tx
        .select()
        .from(supplierDrafts)
        .where(eq(supplierDrafts.idempotencyKey, r.borrador.idempotencyKey))
        .for("update")
        .limit(1);
      if (!bloq[0] || bloq[0].estado !== "pendiente") throw RESUELTO;
      const ins = await tx
        .insert(supplierInvoices)
        .values({
          idempotencyKey: r.factura.idempotencyKey,
          draftId: filaDraft.id,
          supplierCuit: r.factura.supplierCuit,
          nombreProveedor: r.factura.nombreProveedor,
          tipo: r.factura.tipo,
          fechaIso: r.factura.fechaIso,
          totalCentavos: r.factura.totalCentavos,
          items: itemsADb(r.factura.items),
          compensatoriaDe: null,
          creadoPor: r.factura.creadoPor,
          createdAt: new Date(r.factura.creadoEn),
        })
        .onConflictDoNothing({ target: supplierInvoices.idempotencyKey })
        .returning({ id: supplierInvoices.id });
      const fila = ins[0];
      if (!fila) throw RESUELTO;
      await tx
        .update(supplierDrafts)
        .set({ estado: "confirmada", confirmadoPor: b.quien, facturaId: fila.id })
        .where(eq(supplierDrafts.idempotencyKey, r.borrador.idempotencyKey));
      // Cierre durable dentro de la misma tx: solo si sigue abierta. Si la
      // cerró otro camino entre el matching y acá, la factura queda igual y
      // el motivo lo dice (el perdedor de una carrera revierte todo: ve el
      // borrador ya resuelto en el bloqueo de arriba).
      if (m?.vinculado && vinculadaId === null && vinculoMotivo !== "orden ya no abierta") {
        const candidato = m.vinculado.orderId;
        if (uuidPorOrden.has(candidato) && candidato.startsWith("oc-")) {
          const tocadas = await tx
            .update(purchaseOrders)
            .set({ estado: "cerrada", cerradoEn: new Date(ahoraIso) })
            .where(
              and(
                eq(purchaseOrders.idempotencyKey, candidato.slice(3)),
                eq(purchaseOrders.estado, "abierta"),
              ),
            )
            .returning({ id: purchaseOrders.id });
          if (tocadas[0]) {
            vinculadaId = candidato;
          } else {
            vinculoMotivo = "orden ya no abierta";
          }
        }
      }
      if (m) {
        for (const e of m.log) {
          const orderUuid = uuidPorOrden.get(e.orderId);
          if (!orderUuid) continue;
          await tx.insert(supplierMatchLog).values({
            draftId: r.borrador.id,
            orderId: orderUuid,
            coincide: e.coincide,
            motivo:
              e.orderId === vinculadaId && e.coincide
                ? "auto-exacto: OC cerrada al confirmar"
                : e.motivo,
            createdAt: new Date(e.creadoEn),
          });
        }
      }
    });

    // Espejo memoria (idéntico estado al histórico).
    store.borradores.set(r.borrador.id, r.borrador);
    store.borradorVistos.set(r.borrador.idempotencyKey, r.borrador);
    store.facturasProv.set(r.factura.id, r.factura);
    if (m) escribirLogMemoria(m.log, vinculadaId);
    if (vinculadaId) {
      const cerrada =
        store.purchaseOrders.get(vinculadaId) ?? (await leerOrdenCompleta(db, vinculadaId));
      if (cerrada && cerrada.estado !== "cerrada") {
        const c = cerrarOrden(cerrada, b.quien, ahoraIso);
        if (c.ok) {
          store.purchaseOrders.set(c.orden.id, c.orden);
          store.orderVistos.set(c.orden.idempotencyKey, c.orden);
        }
      } else if (cerrada) {
        store.purchaseOrders.set(cerrada.id, cerrada);
        store.orderVistos.set(cerrada.idempotencyKey, cerrada);
      }
    }
    return Response.json(
      {
        factura_id: r.factura.id,
        total_centavos: r.factura.totalCentavos.toString(),
        aviso_revisar: r.avisoRevisar,
        vinculo: vinculadaId !== null ? { order_id: vinculadaId } : null,
        vinculo_motivo: vinculoMotivo,
        match_intentos: m ? m.log.length : 0,
        fuente: "db",
      },
      { status: 201 },
    );
  } catch (e) {
    if (e === RESUELTO) {
      return Response.json({ error: "borrador ya resuelto (confirmado o descartado)" }, { status: 409 });
    }
    // Caída de DB: la tx revirtió; vía memoria como antes.
    if (!enMemoria) return Response.json({ error: "borrador inexistente" }, { status: 404 });
    const r2 = confirmarBorrador(enMemoria, { quien: b.quien, ahoraIso });
    if (r2.status !== 201) return Response.json({ error: r2.error }, { status: r2.status });
    return confirmarEnMemoria(r2.borrador, r2.factura, r2.avisoRevisar, b.quien, ahoraIso);
  }
};

// La fila del borrador siempre existe en DB-first: si el alta fue durante un
// corte de DB se rellena pendiente (el dominio ya validó el pase a confirmada).
async function asegurarFilaBorrador(
  db: TenantDb,
  base: Borrador,
): Promise<{ id: string }> {
  const previo = await leerBorradorPorKey(db, base.idempotencyKey);
  if (previo) return { id: previo.fila.id };
  await db
    .insert(supplierDrafts)
    .values({
      idempotencyKey: base.idempotencyKey,
      origen: base.origen,
      bytesRef: base.bytesRef,
      cuit: base.cuit,
      nombreProveedor: base.nombreProveedor,
      fechaIso: base.fechaIso,
      totalCentavos: base.totalCentavos,
      items: itemsADb(base.items),
      confianza: { ...base.confianza },
      estado: "pendiente",
      fotoPendiente: base.fotoPendiente,
      confirmadoPor: null,
      facturaId: null,
      createdAt: new Date(base.creadoEn),
      venceAt: new Date(base.venceAt),
    })
    .onConflictDoNothing({ target: supplierDrafts.idempotencyKey });
  const fila = await leerBorradorPorKey(db, base.idempotencyKey);
  if (!fila) throw new Error("borrador sin fila");
  return { id: fila.fila.id };
}

function escribirLogMemoria(log: ReadonlyArray<MatchLogEntry>, vinculadaId: string | null): void {
  for (const e of log) {
    if (store.supplierMatchLog.some((x) => x.id === e.id)) continue;
    store.supplierMatchLog.push(
      e.orderId === vinculadaId && e.coincide
        ? { ...e, motivo: "auto-exacto: OC cerrada al confirmar" }
        : e,
    );
  }
}

// Vía histórica exacta (sin DB o fallback): matching sobre memoria, cierre en
// memoria y log en memoria.
function confirmarEnMemoria(
  borrador: Borrador,
  factura: Factura,
  avisoRevisar: boolean,
  quien: string,
  ahoraIso: string,
): Response {
  store.borradores.set(borrador.id, borrador);
  store.borradorVistos.set(borrador.idempotencyKey, borrador);
  store.facturasProv.set(factura.id, factura);
  let vinculo: { order_id: string } | null = null;
  let vinculoMotivo = "borrador sin cuit o total";
  let matchIntentos = 0;
  if (borrador.cuit !== null && borrador.totalCentavos !== null) {
    const m = vincular_auto({
      draftId: borrador.id,
      cuit: borrador.cuit,
      totalCentavos: borrador.totalCentavos,
      ordenes: [...store.purchaseOrders.values()].map((o) => ({
        id: o.id,
        supplierCuit: o.supplierCuit,
        estado: o.estado,
        totalCentavos: o.totalCentavos,
      })),
      ahoraIso,
    });
    matchIntentos = m.log.length;
    vinculoMotivo = m.motivo;
    let vinculadaId: string | null = null;
    if (m.vinculado !== null) {
      const oc = store.purchaseOrders.get(m.vinculado.orderId);
      if (oc !== undefined && oc.estado === "abierta") {
        const c = cerrarOrden(oc, quien, ahoraIso);
        if (c.ok) {
          store.purchaseOrders.set(oc.id, c.orden);
          vinculadaId = oc.id;
        } else {
          vinculoMotivo = "orden ya no abierta";
        }
      } else {
        vinculoMotivo = "orden ya no abierta";
      }
    }
    escribirLogMemoria(m.log, vinculadaId);
    if (vinculadaId !== null) vinculo = { order_id: vinculadaId };
  }
  return Response.json(
    {
      factura_id: factura.id,
      total_centavos: factura.totalCentavos.toString(),
      aviso_revisar: avisoRevisar,
      vinculo,
      vinculo_motivo: vinculoMotivo,
      match_intentos: matchIntentos,
    },
    { status: 201 },
  );
}
