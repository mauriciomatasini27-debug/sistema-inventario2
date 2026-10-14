import type { APIRoute } from "astro";
import { prepareOrderSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { prepararOrdenRepo } from "../../../lib/repos/ordenes-pago.js";

export const prerender = false;

// POST /api/payment-orders/prepare — el bot prepara, el comerciante paga (OP7).
// La plata NUNCA se mueve acá; link fuera de allowlist => 422.
// PERS2-S15: el repo numera por tenant con DB primero.
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
  try {
    const r = await prepararOrdenRepo({
      key,
      payeeId: b.payee_id,
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
    });
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
