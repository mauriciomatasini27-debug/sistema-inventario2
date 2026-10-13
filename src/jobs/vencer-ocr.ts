import { store } from "../lib/store.js";
import { con_recuerdo, necesita_recuerdo } from "../modules/ocr/jobs.js";

// Job vencimiento OCR (ADR-0005 E5 + recuerdo 24h). El vencido a 7 días es
// derivado (el núcleo responde 410, solo lectura); acá se emite ocr_vencido
// una vez y se marca recuerdo a 24h si sigue sin toque. Idempotente.
export function ejecutarVencimientoOcr(ahoraIso = new Date().toISOString()): { vencidos: string[]; recuerdos: string[] } {
  const vencidos: string[] = [];
  const recuerdos: string[] = [];
  for (const [id, job] of store.ocrJobs) {
    const borrador = job.borradorId ? store.borradores.get(job.borradorId) : undefined;
    if (!borrador || borrador.estado !== "pendiente") continue;
    if (ahoraIso > borrador.venceAt) {
      vencidos.push(id);
      store.ocrEventos.push({ tipo: "ocr_vencido", payload: { job_id: id } });
      continue;
    }
    if (necesita_recuerdo({ creadoEn: job.creadoEn, recordadoEn: job.recordadoEn, venceAt: borrador.venceAt, ahoraIso })) {
      store.ocrJobs.set(id, con_recuerdo(job, ahoraIso));
      recuerdos.push(id);
      store.ocrEventos.push({ tipo: "ocr_recuerdo", payload: { job_id: id } });
    }
  }
  return { vencidos, recuerdos };
}
