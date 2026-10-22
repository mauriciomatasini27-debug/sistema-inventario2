import type { APIRoute } from "astro";
import { creditPaymentSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { cobroFiado } from "../../../lib/repos/fiado.js";

export const prerender = false;

// POST /api/credit/payments — C18: cobro ingresa a caja (origen cobro_fiado).
// PERS2-S17: DB-first en el repo de fiado. Clave repetida responde 409 con
// relectura; cobro e ingreso a caja entran en la misma transacción (P10-15).
// Sin DB en single cae a memoria; si la transacción falla, el error se propaga
// y no se escribe una mitad sola.
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
  let r: Awaited<ReturnType<typeof cobroFiado>>;
  try {
    r = await cobroFiado({
      key,
      customerId: b.customer_id,
      montoCentavos: BigInt(b.monto_centavos),
      medio: b.medio,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  if (r.fuente === "db") {
    return Response.json(
      { customer_id: r.customerId, haber_centavos: r.haberCentavos, fuente: "db" },
      { status: 201 },
    );
  }
  return Response.json({ customer_id: r.customerId, haber_centavos: r.haberCentavos }, { status: 201 });
};
