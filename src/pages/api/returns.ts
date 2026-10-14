import type { APIRoute } from "astro";
import { postReturnsSchema } from "../../lib/validation.js";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { tenantDeRequest } from "../../lib/tenant-context.js";
import { registrarDevolucion } from "../../lib/repos/ventas.js";

export const prerender = false;

// POST /api/returns — devolución interna + NC automática (FE-S14/S15).
// Borde fino: valida, decide devolución pura (tope C14) y NC fiscal (tope
// contra facturado, CbtesAsoc) ANTES de persistir; aplica ambos en un solo
// bloque o no escribe nada. Idempotente por Idempotency-Key (409 con original).
// PERS2-S25: memoria y tablas viven en el repo de ventas (sale_returns con
// DB viva, memoria particionada solo en single sin base).
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = postReturnsSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  // ISO-S3: la NC hereda el tenant del contexto (mismo comercio de la factura).
  const tenantResuelto = tenantDeRequest(request);
  const tenantId = tenantResuelto.ok ? tenantResuelto.tenantId : undefined;

  let r: Awaited<ReturnType<typeof registrarDevolucion>>;
  try {
    r = await registrarDevolucion({
      key,
      saleId: b.sale_id,
      montoCentavos: BigInt(b.monto_centavos),
      items: b.items.map((it) => ({ sku: it.product_id, cantidad: it.qty })),
      medio: b.medio,
      motivo: b.motivo,
      actor: b.actor,
      clientOccurredAt: b.client_occurred_at,
      ...(tenantId !== undefined ? { tenantId } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.status === 409) return Response.json({ error: r.error, original: r.original }, { status: 409 });
    if (r.status === 404) return Response.json({ error: r.error }, { status: 404 });
    if (r.acumulado_centavos !== undefined) {
      return Response.json({ error: r.error, acumulado_centavos: r.acumulado_centavos }, { status: 422 });
    }
    if (r.facturado_centavos !== undefined) {
      return Response.json({ error: r.error, facturado_centavos: r.facturado_centavos }, { status: 422 });
    }
    return Response.json({ error: r.error }, { status: 422 });
  }

  return Response.json(
    {
      return_id: r.returnId,
      numero_devolucion: r.numero,
      sale_id: r.saleId,
      monto_centavos: r.montoCentavos,
      fiscal_estado: r.fiscalEstado,
      nc_tipo: r.ncTipo,
    },
    { status: 201 },
  );
};
