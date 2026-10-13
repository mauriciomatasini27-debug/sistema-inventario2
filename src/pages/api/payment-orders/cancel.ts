import type { APIRoute } from "astro";
import { cancelOrderSchema } from "../../../lib/validation.js";
import { cancelar_orden } from "../../../modules/payments/ordenes.js";
import { store } from "../../../lib/store.js";

export const prerender = false;

// POST /api/payment-orders/cancel — cancelación auditada (OP2/OP13, solo Dueño).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = cancelOrderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const orden = store.paymentOrders.get(b.order_id);
  if (!orden) return Response.json({ error: "orden inexistente" }, { status: 404 });
  const r = cancelar_orden({
    orden,
    versionEsperada: b.version_esperada,
    motivo: b.motivo,
    rol: "dueno",
    actor: b.actor,
    origen: "web",
    ahoraMs: Date.now(),
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTA") return Response.json({ error: "orden ya procesada" }, { status: 409 });
    if (r.codigo === "SOLO_DUENO") return Response.json({ error: r.error }, { status: 403 });
    if (r.codigo === "VERSION_DESACTUALIZADA") return Response.json({ error: "version desactualizada" }, { status: 409 });
    return Response.json({ error: r.error }, { status: 422 });
  }
  store.paymentOrders.set(b.order_id, r.orden);
  return Response.json({ order_id: r.orden.id, estado: r.orden.estado });
};
