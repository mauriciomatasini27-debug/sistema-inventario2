import type { APIRoute } from "astro";
import { closeOrderSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { cerrarOrdenRepo } from "../../../lib/repos/proveedores.js";

export const prerender = false;

// valida igual que antes y el cierre se escribe durable; con memoria fría se
// reconstruye desde cabecera+líneas). En multi sin base el repo propaga
// BaseNoDisponible y la ruta responde 503.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = closeOrderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const ahoraIso = new Date().toISOString();
  let r: Awaited<ReturnType<typeof cerrarOrdenRepo>>;
  try {
    r = await cerrarOrdenRepo({ orderId: b.order_id, quien: b.quien, ahoraIso });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "INEXISTENTE") return Response.json({ error: "orden inexistente" }, { status: 404 });
    return Response.json({ error: r.error }, { status: 422 });
  }
  if (r.fuente === "db") return Response.json({ order_id: r.orderId, estado: r.estado, fuente: "db" });
  return Response.json({ order_id: r.orderId, estado: r.estado });
};
