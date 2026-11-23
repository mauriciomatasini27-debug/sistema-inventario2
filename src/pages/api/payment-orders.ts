import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { exigirDuenoDeRequest } from "../../lib/tenant-context.js";
import { listarOrdenesJob } from "../../lib/repos/ordenes-pago.js";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  try {
    const ordenes = await listarOrdenesJob();
    const items = [...ordenes]
      .sort((a, b) => a.venceElMs - b.venceElMs || a.numero.localeCompare(b.numero))
      .map((o) => ({
        order_id: o.id,
        numero: o.numero,
        payee_id: o.payeeId,
        concepto: o.concepto,
        monto_centavos: o.montoCentavos.toString(),
        vence_el_ms: o.venceElMs,
        medio_sugerido: o.medioSugerido,
        instruccion: o.instruccion,
        categoria: o.categoria,
        estado: o.estado,
        version: o.version,
        ...(o.nota !== undefined ? { nota: o.nota } : {}),
        ...(o.supplierInvoiceId !== undefined ? { supplier_invoice_id: o.supplierInvoiceId } : {}),
        ...(o.servicioId !== undefined ? { servicio_id: o.servicioId } : {}),
        ...(o.montoPagadoCentavos !== undefined
          ? { monto_pagado_centavos: o.montoPagadoCentavos.toString() }
          : {}),
        ...(o.medioPagado !== undefined ? { medio_pagado: o.medioPagado } : {}),
        ...(o.motivoCancelacion !== undefined ? { motivo_cancelacion: o.motivoCancelacion } : {}),
      }));
    return Response.json({ items });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
