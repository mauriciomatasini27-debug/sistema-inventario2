import type { APIRoute } from "astro";
import { cancelOrderSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import { cancelarOrdenRepo } from "../../../lib/repos/ordenes-pago.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = cancelOrderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  try {
    const r = await cancelarOrdenRepo({
      orderId: b.order_id,
      versionEsperada: b.version_esperada,
      motivo: b.motivo,
      actor: b.actor,
    });
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
