import type { APIRoute } from "astro";
import { syncPushSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { empujarOperacion } from "../../../lib/repos/sync.js";

export const prerender = false;

// POST /api/sync/push — Idempotency-Key debe igualar op_id (ADR-0001/0003).
// PERS-S2 (PRD-PERS-01): DB-first. op_id repetido con mismo payload responde
// 200 replay sin duplicar; con distinto payload 409. Sin DB o ante error, la
// vía memoria histórica resuelve igual que antes y la venta no se pierde.
// PERS2-S21: outbox y secuencia por el repo de sync (ADR-0061); en multi sin
// base propaga BaseNoDisponible y responde 503.

export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = syncPushSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  if (key !== b.op_id) return Response.json({ error: "Idempotency-Key debe igualar op_id" }, { status: 422 });

  try {
    const r = await empujarOperacion({
      opId: b.op_id,
      deviceCode: b.device_code,
      deviceSeq: b.device_seq,
      hlc: b.hlc,
      modulo: b.modulo,
      payload: b.payload,
    });
    return Response.json(r.cuerpo, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
