import type { APIRoute } from "astro";
import { supplierPaymentSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { registrarPagoProveedorRepo } from "../../../lib/repos/facturas-proveedor.js";

export const prerender = false;

// POST /api/supplier-invoices/payments — pago a proveedor + egreso caja (FP5).
// Pago que excede el saldo se rechaza 422 en el núcleo.
// PERS2-S14: el repo es dueño de duplicado → insert → espejo; el egreso va
// por el repo de caja.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = supplierPaymentSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const ahoraIso = new Date().toISOString();
  try {
    const r = await registrarPagoProveedorRepo({
      key,
      ...(b.factura_id !== undefined ? { facturaId: b.factura_id } : {}),
      supplierCuit: b.supplier_cuit,
      montoCentavos: BigInt(b.monto_centavos),
      metodo: b.metodo,
      fechaIso: b.fecha_iso,
      creadoPor: b.creado_por,
      ahoraIso,
    });
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
