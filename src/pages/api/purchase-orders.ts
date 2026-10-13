import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { purchaseOrderCreateSchema } from "../../lib/validation.js";
import { crearOrden } from "../../modules/purchases/proveedores.js";
import { store } from "../../lib/store.js";
import { getTenantDb } from "../../lib/db.js";
import { purchaseOrderLines, purchaseOrders } from "../../db/schema-proveedores.js";

export const prerender = false;

type TenantDb = ReturnType<typeof getTenantDb>;

function dbViva(): TenantDb | null {
  try {
    return getTenantDb();
  } catch {
    return null;
  }
}

// POST /api/purchase-orders — crea OC abierta (cerrada jamás se edita).
// PERS-S4: DB-first. Pre-check por idempotency-key → 409 real aunque la
// memoria esté fría; cabecera + líneas entran en 1 tx con espejo memoria
// (el matching/F3 y el webhook semanal leen el espejo hasta su slice).
// Sin DB o ante error, la vía memoria histórica resuelve igual que antes.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = purchaseOrderCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const r = crearOrden({
    idempotencyKey: key,
    supplierCuit: b.supplier_cuit,
    lineas: b.lineas.map((l) => ({ sku: l.sku, qty: l.qty, costoCentavos: BigInt(l.costo_centavos) })),
    creadoPor: b.creado_por,
    ahoraIso: new Date().toISOString(),
    vistos: store.orderVistos,
  });
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });

  const espejo = () => {
    store.orderVistos.set(key, r.orden);
    store.purchaseOrders.set(r.orden.id, r.orden);
  };

  const db = dbViva();
  if (!db) {
    espejo();
    return Response.json({ order_id: r.orden.id, total_centavos: r.orden.totalCentavos.toString() }, { status: 201 });
  }

  try {
    const previo = await db.select().from(purchaseOrders).where(eq(purchaseOrders.idempotencyKey, key)).limit(1);
    if (previo[0]) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    // El id de dominio (oc-<key>) no es uuid: la DB genera el propio; las
    // líneas referencian el uuid durable y el espejo conserva el id de dominio.
    let repetida = false;
    await db.transaction(async (tx) => {
      const filas = await tx
        .insert(purchaseOrders)
        .values({
          idempotencyKey: key,
          supplierCuit: r.orden.supplierCuit,
          estado: r.orden.estado,
          totalCentavos: r.orden.totalCentavos,
          creadoPor: r.orden.creadoPor,
        })
        .onConflictDoNothing({ target: purchaseOrders.idempotencyKey })
        .returning({ id: purchaseOrders.id });
      const fila = filas[0];
      if (!fila) {
        // Carrera entre pre-check e insert: nada se escribió, 409 real.
        repetida = true;
        return;
      }
      await tx.insert(purchaseOrderLines).values(
        r.orden.lineas.map((l) => ({
          orderId: fila.id,
          sku: l.sku,
          qty: l.qty,
          costoCentavos: l.costoCentavos,
        })),
      );
    });
    if (repetida) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    espejo();
    return Response.json({ order_id: r.orden.id, total_centavos: r.orden.totalCentavos.toString(), fuente: "db" }, { status: 201 });
  } catch {
    // Caída de DB a mitad de camino: la tx revirtió; la orden no se pierde.
    espejo();
    return Response.json({ order_id: r.orden.id, total_centavos: r.orden.totalCentavos.toString() }, { status: 201 });
  }
};
