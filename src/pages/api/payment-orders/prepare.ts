import type { APIRoute } from "astro";
import { prepareOrderSchema } from "../../../lib/validation.js";
import { preparar_orden } from "../../../modules/payments/ordenes.js";
import { store } from "../../../lib/store.js";

export const prerender = false;

// POST /api/payment-orders/prepare — el bot prepara, el comerciante paga (OP7).
// La plata NUNCA se mueve acá; link fuera de allowlist => 422.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = prepareOrderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const n = store.payOrderCounter;
  const r = preparar_orden({
    id: crypto.randomUUID(),
    idempotencyKey: key,
    numero: `OP-${String(n).padStart(4, "0")}`,
    payeeId: b.payee_id,
    payees: store.payees,
    concepto: b.concepto,
    montoCentavos: BigInt(b.monto_centavos),
    venceElMs: b.vence_el_ms,
    medioSugerido: b.medio_sugerido,
    instruccion: b.instruccion,
    ...(b.link_url !== undefined ? { linkUrl: b.link_url } : {}),
    ...(b.referencia !== undefined ? { referencia: b.referencia } : {}),
    ...(b.categoria !== undefined ? { categoria: b.categoria } : {}),
    ...(b.nota !== undefined ? { nota: b.nota } : {}),
    creadoPor: b.creado_por,
    origen: "web",
    ahoraMs: Date.now(),
    vistos: store.paymentOrderVistos,
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTA") return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    if (r.codigo === "SOLO_DUENO") return Response.json({ error: r.error }, { status: 403 });
    if (r.codigo === "VERSION_DESACTUALIZADA") return Response.json({ error: "version desactualizada" }, { status: 409 });
    return Response.json({ error: r.error }, { status: 422 });
  }
  store.payOrderCounter = n + 1;
  store.paymentOrders.set(r.orden.id, r.orden);
  return Response.json({ order_id: r.orden.id, numero: r.orden.numero, estado: r.orden.estado }, { status: 201 });
};
