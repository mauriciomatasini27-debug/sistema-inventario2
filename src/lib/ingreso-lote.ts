import { z } from "zod";
import { BaseNoDisponible } from "./server-db.js";
import { crearAlmacenProductos } from "./repos/_almacen.js";
import { crearLote } from "./repos/lotes.js";

export const loteSchema = z.object({
  sku: z.string().min(1).max(64),
  cantidad: z.number().int().min(1).max(999),
  vence_el: z.string().datetime().nullable().optional(),
  costo_centavos: z.number().int().min(0).default(0),
  controla_vencimiento: z.boolean().default(false),
  idempotency_key: z.string().min(1).max(128).optional(),
});

// Via unica de ingreso CAT-S3 para POST /api/lots y POST /api/stock/ingreso.
// Resuelve controla_vencimiento como body OR ficha del producto, crea el lote
// por el repo y mapea a 201 / 422 / 409 / 503.
export async function manejarIngresoLote(request: Request): Promise<Response> {
  const headerKey = request.headers.get("Idempotency-Key") ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = loteSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const sku = b.sku.trim().toUpperCase();
  const idem = b.idempotency_key ?? (headerKey || crypto.randomUUID());
  const ficha = crearAlmacenProductos().obtener(sku);
  const controla = b.controla_vencimiento || ficha?.controlaVencimiento === true;
  let r: Awaited<ReturnType<typeof crearLote>>;
  try {
    r = await crearLote({
      sku,
      cantidad: b.cantidad,
      venceEl: b.vence_el ?? null,
      costoCentavos: b.costo_centavos,
      controlaVencimiento: controla,
      idemKey: idem,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "SIN_VENCIMIENTO") return Response.json({ error: "controla_vencimiento exige vence_el" }, { status: 422 });
    return Response.json({ error: "duplicado", original: r.original }, { status: 409 });
  }
  return Response.json(r.lote, { status: 201 });
}
