import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { creditSaleSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { getTenantDb } from "../../../lib/db.js";
import { dbVivaTenant } from "../../../lib/server-db.js";
import { customerMovements } from "../../../db/schema-credito.js";
import { lotesDesdeStock, type Sku } from "../../../modules/inventario/inventario.js";
import { venta_a_cuenta } from "../../../modules/credit/fiado.js";

export const prerender = false;

// POST /api/credit/sales-on-account — FC2/C18: descuenta stock, suma fiado, cero caja.
// PERS-S4: DB-first. Clave repetida responde 409 con relectura; el debe entra con
// espejo memoria. Sin DB o ante error, la vía memoria histórica resuelve igual que
// antes y la venta no se pierde. El descuento de stock en la misma tx llega con N1 CAT.

type TenantDb = ReturnType<typeof getTenantDb>;

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = creditSaleSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  if (store.creditVistos.has(key)) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
  const r = venta_a_cuenta({
    idempotencyKey: key,
    customerId: b.customer_id,
    lineas: b.lineas.map((l) => ({ sku: l.product_id as Sku, cantidad: l.qty, precioCentavos: BigInt(l.precio_centavos) })),
    deviceCode: b.device_code,
    seqLocal: b.seq_local,
    offline: false,
    lotes: lotesDesdeStock(store.stock),
    vistos: new Map(),
    ultimoDefinitivo: store.nextTicket > 1 ? { n: store.nextTicket - 1 } : null,
    saldoActualCentavos: BigInt(b.saldo_actual_centavos),
    topeCentavos: BigInt(b.tope_centavos),
    rol: "dueno",
    ahoraMs: Date.now(),
  });
  if (!r.ok) {
    const status = r.status as number;
    return Response.json({ error: r.codigo }, { status });
  }
  const total = b.lineas.reduce((acc, l) => acc + BigInt(l.qty) * BigInt(l.precio_centavos), 0n);

  const espejoMemoria = () => {
    store.creditVistos.set(key, { customer_id: b.customer_id });
    store.creditMovs.push({ customer_id: b.customer_id, debe: total.toString(), haber: "0", key, fecha_ms: Date.now() });
    if (r.efecto.ticket.definitivo) store.nextTicket += 1;
  };

  const db = dbVivaTenant();
  if (!db) {
    const dup = store.creditMovs.find((m) => m.key === key);
    if (dup) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    espejoMemoria();
    return Response.json({ ticket_definitivo: r.efecto.ticket.definitivo, total_centavos: total.toString() }, { status: 201 });
  }

  try {
    const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, key)).limit(1);
    if (previo[0]) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    await db.insert(customerMovements).values({
      customerId: b.customer_id,
      tipo: "venta",
      debeCentavos: total,
      haberCentavos: 0n,
      idempotencyKey: key,
      clientOccurredAt: new Date(),
    });
    espejoMemoria();
    return Response.json(
      { ticket_definitivo: r.efecto.ticket.definitivo, total_centavos: total.toString(), fuente: "db" },
      { status: 201 },
    );
  } catch (e) {
    // Carrera entre pre-check e insert: mismo 409 con relectura.
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, key)).limit(1);
        if (previo[0]) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
      } catch {
        // Cae al espejo memoria de abajo.
      }
    }
    // Caída de DB a mitad de camino: la venta no se pierde.
    if (store.creditVistos.has(key)) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    espejoMemoria();
    return Response.json({ ticket_definitivo: r.efecto.ticket.definitivo, total_centavos: total.toString() }, { status: 201 });
  }
};
