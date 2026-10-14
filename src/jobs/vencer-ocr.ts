import { actualizarJob, listarJobs, registrarEventoOcr } from "../lib/repos/ocr.js";
import { leerBorradorOcrRepo } from "../lib/repos/facturas-proveedor.js";
import { con_recuerdo, necesita_recuerdo } from "../modules/ocr/jobs.js";

// Job vencimiento OCR (ADR-0005 E5 + recuerdo 24h). El vencido a 7 días es
// derivado (el núcleo responde 410, solo lectura); acá se emite ocr_vencido
// una vez y se marca recuerdo a 24h si sigue sin toque. Idempotente.
// PERS4-S4: lista por el repo y lee borradores por facturas-proveedor.
export async function ejecutarVencimientoOcr(
  ahoraIso = new Date().toISOString(),
): Promise<{ vencidos: string[]; recuerdos: string[] }> {
  const vencidos: string[] = [];
  const recuerdos: string[] = [];
  for (const job of await listarJobs()) {
    const borrador = job.borradorId ? await leerBorradorOcrRepo(job.borradorId) : null;
    if (!borrador || borrador.estado !== "pendiente") continue;
    if (ahoraIso > borrador.venceAt) {
      vencidos.push(job.id);
      await registrarEventoOcr("ocr_vencido", { job_id: job.id });
      continue;
    }
    if (necesita_recuerdo({ creadoEn: job.creadoEn, recordadoEn: job.recordadoEn, venceAt: borrador.venceAt, ahoraIso })) {
      await actualizarJob(con_recuerdo(job, ahoraIso));
      recuerdos.push(job.id);
      await registrarEventoOcr("ocr_recuerdo", { job_id: job.id });
    }
  }
  return { vencidos, recuerdos };
}
