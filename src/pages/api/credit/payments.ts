import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { creditPaymentSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { getTenantDb } from "../../../lib/db.js";
import { cashMovements } from "../../../db/schema.js";
import { customerMovements } from "../../../db/schema-credito.js";
import { cobro_fiado } from "../../../modules/credit/fiado.js";

export const prerender = false;

// POST /api/credit/payments — C18: cobro ingresa a caja (origen cobro_fiado).
// PERS-S4: DB-first. Clave repetida responde 409 con relectura; cobro e ingreso
// a caja entran en 1 tx con espejo memoria. Sin DB o ante error, la vía memoria
// histórica resuelve igual que antes y el cobro no se pierde.

type TenantDb = ReturnType<typeof getTenantDb>;

function dbViva(): TenantDb | null {
  try {
    return getTenantDb();
  } catch {
    return null;
  }
}

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

interface CobroBody {
  readonly customer_id: string;
  readonly monto_centavos: number;
  readonly medio: "Efectivo" | "Debito" | "Mercado Pago" | "QR" | "Transferencia";
}

function espejoMemoria(key: string, b: CobroBody): void {
  store.creditVistos.set(key, { customer_id: b.customer_id });
  store.creditMovs.push({ customer_id: b.customer_id, debe: "0", haber: BigInt(b.monto_centavos).toString(), key });
  store.movements.push({
    id: crypto.randomUUID(),
    tipo: "ingreso",
    metodo: b.medio,
    monto_centavos: BigInt(b.monto_centavos).toString(),
    origen: "cobro_fiado",
    idempotency_key: key,
  });
}

function viaMemoria(key: string, b: CobroBody): Response {
  espejoMemoria(key, b);
  return Response.json({ customer_id: b.customer_id, haber_centavos: BigInt(b.monto_centavos).toString() }, { status: 201 });
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
  const parsed = creditPaymentSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  if (store.creditVistos.has(key)) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
  const r = cobro_fiado({
    idempotencyKey: key,
    customerId: b.customer_id,
    montoCentavos: BigInt(b.monto_centavos),
    medio: b.medio,
    ahoraMs: Date.now(),
    vistos: new Map(),
  });
  if (!r.ok) return Response.json({ error: r.codigo }, { status: r.status as number });

  const db = dbViva();
  if (!db) {
    const dup = store.creditMovs.find((m) => m.key === key);
    if (dup) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    return viaMemoria(key, b);
  }

  try {
    const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, key)).limit(1);
    if (previo[0]) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    await db.transaction(async (tx) => {
      await tx.insert(customerMovements).values({
        customerId: b.customer_id,
        tipo: "cobro",
        debeCentavos: 0n,
        haberCentavos: BigInt(b.monto_centavos),
        idempotencyKey: key,
        clientOccurredAt: new Date(),
      });
      await tx.insert(cashMovements).values({
        saleId: null,
        idempotencyKey: key,
        tipo: "ingreso",
        metodo: b.medio,
        categoriaId: "cobro_fiado",
        origen: "cobro_fiado",
        montoCentavos: BigInt(b.monto_centavos),
      });
    });
    espejoMemoria(key, b);
    return Response.json(
      { customer_id: b.customer_id, haber_centavos: BigInt(b.monto_centavos).toString(), fuente: "db" },
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
    // Caída de DB a mitad de camino: la tx revirtió; el cobro no se pierde.
    if (store.creditVistos.has(key)) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    return viaMemoria(key, b);
  }
};
