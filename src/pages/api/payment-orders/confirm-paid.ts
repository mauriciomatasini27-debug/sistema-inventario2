import type { APIRoute } from "astro";
import { confirmOrderPaymentSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import { confirmarPagoOrdenRepo } from "../../../lib/repos/ordenes-pago.js";

export const prerender = false;

// PERS2-S15: el repo persiste por DB primero; el egreso va por caja.
export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
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
  try {
    const r = await confirmarPagoOrdenRepo({
      key,
      orderId: b.order_id,
      versionEsperada: b.version_esperada,
      ...(b.monto_pagado_centavos !== undefined ? { montoPagadoCentavos: BigInt(b.monto_pagado_centavos) } : {}),
      medio: b.medio,
      ...(b.nota !== undefined ? { nota: b.nota } : {}),
      ...(b.comprobante_ref !== undefined ? { comprobanteRef: b.comprobante_ref } : {}),
      actor: b.actor,
    });
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
