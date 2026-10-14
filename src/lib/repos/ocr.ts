import { store } from "../store.js";
import { con_borrador, type OcrJob } from "../../modules/ocr/jobs.js";

// PERS2-S20 (ADR-0060): trabajos y eventos de OCR. ocrJobs has no table: jobs y
// eventos viven en la memoria particionada por tenant; borradores y facturas
// van por facturas-proveedor.ts con DB primero.

export function buscarJobPorClave(key: string): OcrJob | null {
  const previoId = store.ocrJobsByKey.get(key);
  if (!previoId) return null;
  return store.ocrJobs.get(previoId) ?? null;
}

export function obtenerJob(id: string): OcrJob | undefined {
  return store.ocrJobs.get(id);
}

export function crearJobRegistro(job: OcrJob): void {
  store.ocrJobs.set(job.id, job);
  store.ocrJobsByKey.set(job.idempotencyKey, job.id);
}

export function marcarJobFallo(job: OcrJob, error: string): OcrJob {
  const fallido: OcrJob = { ...job, estado: "fallo", error };
  store.ocrJobs.set(job.id, fallido);
  return fallido;
}

export function vincularBorradorAlJob(job: OcrJob, borradorId: string, ahoraIso: string): OcrJob {
  const vinculado = con_borrador(job, borradorId, ahoraIso);
  store.ocrJobs.set(job.id, vinculado);
  return vinculado;
}

export function actualizarJob(job: OcrJob): void {
  store.ocrJobs.set(job.id, job);
}

export function registrarEventoOcr(tipo: string, payload: unknown): void {
  store.ocrEventos.push({ tipo, payload });
}
