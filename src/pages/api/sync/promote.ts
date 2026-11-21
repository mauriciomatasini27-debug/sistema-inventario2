import type { APIRoute } from "astro";
import { syncPromoteSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { promoverOperacion } from "../../../lib/repos/sync.js";

export const prerender = false;

// con lock en DB, contador del store en memoria).
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
