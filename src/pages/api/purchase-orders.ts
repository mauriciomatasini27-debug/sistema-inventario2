import type { APIRoute } from "astro";
import { purchaseOrderCreateSchema } from "../../lib/validation.js";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { crearOrdenRepo } from "../../lib/repos/proveedores.js";

export const prerender = false;

// idempotency-key con cabecera+líneas en 1 tx y espejo memoria). En multi sin
// base el repo propaga BaseNoDisponible y la ruta responde 503.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = purchaseOrderCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof crearOrdenRepo>>;
  try {
    r = await crearOrdenRepo({
      key,
      supplierCuit: b.supplier_cuit,
      lineas: b.lineas.map((l) => ({ sku: l.sku, qty: l.qty, costoCentavos: BigInt(l.costo_centavos) })),
      creadoPor: b.creado_por,
      ahoraIso: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: r.codigo === "DUPLICADA" ? 409 : 422 });
  if (r.fuente === "db") return Response.json({ order_id: r.orderId, total_centavos: r.totalCentavos, fuente: "db" }, { status: 201 });
  return Response.json({ order_id: r.orderId, total_centavos: r.totalCentavos }, { status: 201 });
};
