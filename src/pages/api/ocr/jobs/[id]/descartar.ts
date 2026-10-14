import type { APIRoute } from "astro";
import { ocrDescartarSchema } from "../../../../../lib/validation.js";
import { BaseNoDisponible } from "../../../../../lib/server-db.js";
import { obtenerJob, registrarEventoOcr } from "../../../../../lib/repos/ocr.js";
import { descartarBorradorOcrRepo } from "../../../../../lib/repos/facturas-proveedor.js";

export const prerender = false;

// POST /api/ocr/jobs/:id/descartar — cierra sin registrar. 200, 409 resuelto,
// 410 vencido (solo lectura).
// PERS2-S20: job y evento por el repo de OCR; borrador por facturas-proveedor.
export const POST: APIRoute = async ({ request, params }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = ocrDescartarSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  try {
    const job = obtenerJob(params.id ?? "");
    if (!job || !job.borradorId) return Response.json({ error: "job inexistente" }, { status: 404 });
    const r = await descartarBorradorOcrRepo({ draftId: job.borradorId, ahoraIso: new Date().toISOString() });
    if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
    registrarEventoOcr("ocr_descartado", { job_id: job.id, motivo: parsed.data.motivo ?? "sin_motivo" });
    return Response.json({ borrador_id: r.borrador.id, estado: "descartada" }, { status: 200 });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
