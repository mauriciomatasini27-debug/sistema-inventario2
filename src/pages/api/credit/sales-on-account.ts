import type { APIRoute } from "astro";
import { creditSaleSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { ventaACuenta } from "../../../lib/repos/fiado.js";

export const prerender = false;

// POST /api/credit/sales-on-account — FC2/C18: descuenta stock, suma fiado, cero caja.
// PERS2-S17: DB-first en el repo de fiado. Clave repetida responde 409 con
// relectura; el debe entra con espejo memoria. Sin DB o ante error, la vía
// memoria histórica resuelve igual que antes y la venta no se pierde.
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
  let r: Awaited<ReturnType<typeof ventaACuenta>>;
  try {
    r = await ventaACuenta({
      key,
      customerId: b.customer_id,
      lineas: b.lineas.map((l) => ({ sku: l.product_id, qty: l.qty, precioCentavos: l.precio_centavos })),
      deviceCode: b.device_code,
      seqLocal: b.seq_local,
      topeCentavos: b.tope_centavos,
      saldoActualCentavos: b.saldo_actual_centavos,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  if (r.fuente === "db") {
    return Response.json(
      { ticket_definitivo: r.ticketDefinitivo, total_centavos: r.totalCentavos, fuente: "db" },
      { status: 201 },
    );
  }
  return Response.json({ ticket_definitivo: r.ticketDefinitivo, total_centavos: r.totalCentavos }, { status: 201 });
};
