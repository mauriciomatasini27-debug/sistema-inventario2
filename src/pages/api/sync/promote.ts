import type { APIRoute } from "astro";
import { syncPromoteSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { promoverOperacion } from "../../../lib/repos/sync.js";

export const prerender = false;

// POST /api/sync/promote — asigna el ticket definitivo T-* a un op offline
// ya pusheado (cierra "sync reasigna definitivo" del Slice-0, ADR-0017).
// Idempotente por op_id: el replay devuelve el mapeo original (200).
// El número sale del correlativo compartido con /api/sales (ticket_counters
// con lock en DB, contador del store en memoria).
// PERS2-S21: mapeos por el repo de sync (ADR-0061); en multi sin base propaga
// BaseNoDisponible y responde 503.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = syncPromoteSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  if (key !== b.op_id) return Response.json({ error: "Idempotency-Key debe igualar op_id" }, { status: 422 });

  try {
    const r = await promoverOperacion({ opId: b.op_id, deviceCode: b.device_code, deviceSeq: b.device_seq });
    return Response.json(r.cuerpo, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
