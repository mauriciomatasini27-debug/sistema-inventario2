import type { APIRoute } from "astro";
import { store } from "../../../../lib/store.js";
import { estado_borrador_api } from "../../../../modules/ocr/jobs.js";

export const prerender = false;

// GET /api/ocr/jobs/:id — borrador con campos, confianza por campo y estado
// pendiente/confirmable/vencida (más confirmada/descartada si ya resolvió).
export const GET: APIRoute = async ({ params }) => {
  const job = store.ocrJobs.get(params.id ?? "");
  if (!job) return Response.json({ error: "job inexistente" }, { status: 404 });
  const borrador = job.borradorId ? store.borradores.get(job.borradorId) : undefined;
  if (!borrador) return Response.json({ job_id: job.id, estado_job: job.estado, borrador: null }, { status: 200 });
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
};
