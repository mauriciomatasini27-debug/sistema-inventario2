import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../../lib/server-db.js";
import { buscarFallbackNubeJob, obtenerJob } from "../../../../lib/repos/ocr.js";
import { leerBorradorOcrRepo } from "../../../../lib/repos/facturas-proveedor.js";
import { estado_borrador_api } from "../../../../modules/ocr/jobs.js";

export const prerender = false;

// pendiente/confirmable/vencida (más confirmada/descartada si ya resolvió).
// PERS2-S20: job por el repo de OCR; borrador por facturas-proveedor.
// OCR1-S4: fallback_nube sale del evento `ocr_borrador_listo` del job (ADR-0005
// y ADR-0089). "ofrecido" es solo una opción de la nube, no una llamada.
export const GET: APIRoute = async ({ params }) => {
  try {
    const job = await obtenerJob(params.id ?? "");
    if (!job) return Response.json({ error: "job inexistente" }, { status: 404 });
    const fallbackNube = await buscarFallbackNubeJob(job.id);
    const borrador = job.borradorId ? await leerBorradorOcrRepo(job.borradorId) : null;
    if (!borrador) return Response.json({ job_id: job.id, estado_job: job.estado, fallback_nube: fallbackNube, borrador: null }, { status: 200 });
    const ahoraIso = new Date().toISOString();
    const estado = estado_borrador_api({
      estadoBorrador: borrador.estado,
      venceAt: borrador.venceAt,
      confianzaFechaBaja: borrador.confianza.fecha === "baja",
      confianzaTotalBaja: borrador.confianza.total === "baja",
      ahoraIso,
    });
    return Response.json(
      {
        job_id: job.id,
        estado_job: job.estado,
        estado: estado,
        fallback_nube: fallbackNube,
        borrador: {
          id: borrador.id,
          cuit: borrador.cuit,
          nombre_proveedor: borrador.nombreProveedor,
          fecha_iso: borrador.fechaIso,
          total_centavos: borrador.totalCentavos?.toString() ?? null,
          confianza: borrador.confianza,
          foto_pendiente: borrador.fotoPendiente,
          vence_at: borrador.venceAt,
        },
      },
      { status: 200 },
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
