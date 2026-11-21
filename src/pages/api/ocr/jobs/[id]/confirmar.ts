import type { APIRoute } from "astro";
import { ocrConfirmarSchema } from "../../../../../lib/validation.js";
import { BaseNoDisponible } from "../../../../../lib/server-db.js";
import { obtenerJob, registrarEventoOcr } from "../../../../../lib/repos/ocr.js";
import { confirmarBorradorOcrRepo } from "../../../../../lib/repos/facturas-proveedor.js";
import { asegurarProveedorDesdeCuit } from "../../../../../lib/repos/proveedores.js";

export const prerender = false;

// POST /api/ocr/jobs/:id/confirmar — ÚNICO camino que registra factura (toque
// explícito). 201 con factura_id, 409 resuelto, 410 vencido, 422 E1.
// PERS2-S20: job y evento por el repo de OCR; borrador y factura por facturas-proveedor.
export const POST: APIRoute = async ({ request, params }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = ocrConfirmarSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  try {
    const job = await obtenerJob(params.id ?? "");
    if (!job || !job.borradorId) return Response.json({ error: "job inexistente" }, { status: 404 });
    const r = await confirmarBorradorOcrRepo({
      draftId: job.borradorId,
      quien: parsed.data.quien,
      ahoraIso: new Date().toISOString(),
    });
    if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
    await registrarEventoOcr("ocr_confirmado", {
      job_id: job.id,
      factura_id: r.factura.id,
      confirmado_por: parsed.data.quien,
    });
    // PROV-S10 (ADR-0096): si el CUIT de la factura no está en la lista del
    // comercio, se da de alta al confirmar. Best-effort: la confirmación ya
    // quedó hecha y un fallo de base no la revierte.
    let proveedorCreado = false;
    try {
      const alta = await asegurarProveedorDesdeCuit({
        cuit: r.factura.supplierCuit,
        nombre: r.factura.nombreProveedor,
        ahoraIso: new Date().toISOString(),
      });
      proveedorCreado = alta.creado;
    } catch (e) {
      if (!(e instanceof BaseNoDisponible)) throw e;
    }
    return Response.json(
      {
        factura_id: r.factura.id,
        total_centavos: r.factura.totalCentavos.toString(),
        aviso_revisar: r.avisoRevisar,
        proveedor_creado: proveedorCreado,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
