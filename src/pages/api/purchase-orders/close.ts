import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { closeOrderSchema } from "../../../lib/validation.js";
import { cerrarOrden, type EstadoOC, type PurchaseOrder } from "../../../modules/purchases/proveedores.js";
import { store } from "../../../lib/store.js";
import { getTenantDb } from "../../../lib/db.js";
import { dbVivaTenant } from "../../../lib/server-db.js";
import { purchaseOrderLines, purchaseOrders } from "../../../db/schema-proveedores.js";

export const prerender = false;

type TenantDb = ReturnType<typeof getTenantDb>;

// El id de dominio es oc-<idempotency-key> (ver crearOrden): inverso definido.
function claveDeOrden(orderId: string): string | null {
  return orderId.startsWith("oc-") ? orderId.slice(3) : null;
}

function dominioDeFilas(
  head: typeof purchaseOrders.$inferSelect,
  lineas: ReadonlyArray<typeof purchaseOrderLines.$inferSelect>,
): PurchaseOrder {
  return Object.freeze({
    id: `oc-${head.idempotencyKey}`,
    idempotencyKey: head.idempotencyKey,
    supplierCuit: head.supplierCuit,
    estado: head.estado as EstadoOC,
    lineas: Object.freeze(
      lineas.map((l) => ({ sku: l.sku, qty: l.qty, costoCentavos: l.costoCentavos })),
    ),
    totalCentavos: head.totalCentavos,
    creadoPor: head.creadoPor,
    creadoEn: head.createdAt.toISOString(),
    cerradoEn: head.cerradoEn ? head.cerradoEn.toISOString() : null,
  });
}

// POST /api/purchase-orders/close — cierra OC abierta (terminal, auditada).
// PERS-S4: DB-first. Con memoria caliente se valida igual que antes y el
// cierre se escribe durable (UPDATE; si la cabecera falta —alta durante un
// corte de DB— se rellena cabecera+líneas desde memoria). Con memoria fría
// se reconstruye el dominio desde cabecera+líneas. Sin DB, memoria como antes.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = closeOrderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const ahoraIso = new Date().toISOString();

  const enMemoria = store.purchaseOrders.get(b.order_id);
  const db = dbVivaTenant();
  if (!db) {
    if (!enMemoria) return Response.json({ error: "orden inexistente" }, { status: 404 });
    const r = cerrarOrden(enMemoria, b.quien, ahoraIso);
    if (!r.ok) return Response.json({ error: r.error }, { status: 422 });
    store.purchaseOrders.set(b.order_id, r.orden);
    return Response.json({ order_id: r.orden.id, estado: r.orden.estado });
  }

  try {
    const base = enMemoria ?? (await reconstruir(db, b.order_id));
    if (!base) return Response.json({ error: "orden inexistente" }, { status: 404 });
    const r = cerrarOrden(base, b.quien, ahoraIso);
    if (!r.ok) return Response.json({ error: r.error }, { status: 422 });
    await persistirCierre(db, r.orden);
    store.orderVistos.set(r.orden.idempotencyKey, r.orden);
    store.purchaseOrders.set(r.orden.id, r.orden);
    return Response.json({ order_id: r.orden.id, estado: r.orden.estado, fuente: "db" });
  } catch {
    // Caída de DB: el cierre no se pierde, queda en memoria como antes.
    if (!enMemoria) return Response.json({ error: "orden inexistente" }, { status: 404 });
    const r = cerrarOrden(enMemoria, b.quien, ahoraIso);
    if (!r.ok) return Response.json({ error: r.error }, { status: 422 });
    store.purchaseOrders.set(b.order_id, r.orden);
    return Response.json({ order_id: r.orden.id, estado: r.orden.estado });
  }
};

async function reconstruir(db: TenantDb, orderId: string): Promise<PurchaseOrder | null> {
  const key = claveDeOrden(orderId);
  if (!key) return null;
  const heads = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.idempotencyKey, key))
    .limit(1);
  const head = heads[0];
  if (!head) return null;
  const lineas = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.orderId, head.id));
  return dominioDeFilas(head, lineas);
}

async function persistirCierre(db: TenantDb, orden: PurchaseOrder): Promise<void> {
  const tocadas = await db
    .update(purchaseOrders)
    .set({ estado: orden.estado, cerradoEn: orden.cerradoEn ? new Date(orden.cerradoEn) : null })
    .where(eq(purchaseOrders.idempotencyKey, orden.idempotencyKey))
    .returning({ id: purchaseOrders.id });
  if (tocadas[0]) return;
  // Sin cabecera (alta durante un corte de DB): se rellena ya cerrada.
  // Quien crea la cabecera escribe sus líneas en la misma tx, así que si la
  // cabecera aparece por carrera ajena basta reintentar el UPDATE.
  const filas = await db
    .insert(purchaseOrders)
    .values({
      idempotencyKey: orden.idempotencyKey,
      supplierCuit: orden.supplierCuit,
      estado: orden.estado,
      totalCentavos: orden.totalCentavos,
      creadoPor: orden.creadoPor,
    })
    .onConflictDoNothing({ target: purchaseOrders.idempotencyKey })
    .returning({ id: purchaseOrders.id });
  const fila = filas[0];
  if (!fila) {
    await db
      .update(purchaseOrders)
      .set({ estado: orden.estado, cerradoEn: orden.cerradoEn ? new Date(orden.cerradoEn) : null })
      .where(eq(purchaseOrders.idempotencyKey, orden.idempotencyKey));
    return;
  }
  await db.insert(purchaseOrderLines).values(
    orden.lineas.map((l) => ({
      orderId: fila.id,
      sku: l.sku,
      qty: l.qty,
      costoCentavos: l.costoCentavos,
    })),
  );
}
