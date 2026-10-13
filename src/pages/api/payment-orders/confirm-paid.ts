import type { APIRoute } from "astro";
import { confirmOrderPaymentSchema } from "../../../lib/validation.js";
import { confirmar_pago } from "../../../modules/payments/ordenes.js";
import { store } from "../../../lib/store.js";

export const prerender = false;

// POST /api/payment-orders/confirm-paid — `Ya pagué` (OP9.1, solo Dueño).
// Registra el egreso en caja (manual) y marca la orden pagada.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = confirmOrderPaymentSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const orden = store.paymentOrders.get(b.order_id);
  if (!orden) return Response.json({ error: "orden inexistente" }, { status: 404 });
  const r = confirmar_pago({
    idempotencyKey: key,
    orden,
    versionEsperada: b.version_esperada,
    ...(b.monto_pagado_centavos !== undefined ? { montoPagadoCentavos: BigInt(b.monto_pagado_centavos) } : {}),
    medio: b.medio,
    ...(b.nota !== undefined ? { nota: b.nota } : {}),
    ...(b.comprobante_ref !== undefined ? { comprobanteRef: b.comprobante_ref } : {}),
    rol: "dueno",
    actor: b.actor,
    origen: "web",
    ahoraMs: Date.now(),
    vistosPagos: store.paymentPagosVistos,
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTA") return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    if (r.codigo === "SOLO_DUENO") return Response.json({ error: r.error }, { status: 403 });
    if (r.codigo === "VERSION_DESACTUALIZADA") return Response.json({ error: "version desactualizada" }, { status: 409 });
    return Response.json({ error: r.error }, { status: 422 });
  }
  store.paymentOrders.set(b.order_id, r.efecto.orden);
  store.movements.push({
    id: crypto.randomUUID(),
    tipo: r.efecto.egreso.tipo,
    metodo: r.efecto.egreso.metodo,
    monto_centavos: r.efecto.egreso.monto_centavos.toString(),
    origen: r.efecto.egreso.origen,
    idempotency_key: key,
  });
  return Response.json({ order_id: r.efecto.orden.id, estado: r.efecto.orden.estado });
};
