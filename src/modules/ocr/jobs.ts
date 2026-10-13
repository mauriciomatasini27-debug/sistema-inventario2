// Jobs OCR Fase 0 (ADR-0005), puro sin IO. El job es idempotente por
// wamid/message-id (E2); el borrador vive en el lane purchases (mutable,
// vence 7 días). Recuerdo a 24h si sigue sin toque; vencido → solo lectura.
import { VENCIMIENTO_BORRADOR_MS } from "../purchases/facturas.js";

export type EstadoOcrJob = "en_cola" | "procesando" | "listo" | "fallo";
export type EstadoBorradorApi = "pendiente" | "confirmable" | "vencida";

export const RECUERDO_OCR_MS = 24 * 60 * 60 * 1000;

export interface OcrJob {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly origen: "wa" | "gmail";
  readonly bytesRef: string;
  readonly emisor: string | null;
  readonly estado: EstadoOcrJob;
  readonly borradorId: string | null;
  readonly error: string | null;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
  readonly recordadoEn: string | null;
}

export function crear_job(input: {
  jobId: string;
  idempotencyKey: string;
  origen: "wa" | "gmail";
  bytesRef: string;
  emisor?: string | null;
  ahoraIso: string;
}): OcrJob {
  return {
    id: input.jobId,
    idempotencyKey: input.idempotencyKey,
    origen: input.origen,
    bytesRef: input.bytesRef,
    emisor: input.emisor ?? null,
    estado: "en_cola",
    borradorId: null,
    error: null,
    creadoEn: input.ahoraIso,
    actualizadoEn: input.ahoraIso,
    recordadoEn: null,
  };
}

export function con_borrador(job: OcrJob, borradorId: string, ahoraIso: string): OcrJob {
  return { ...job, estado: "listo", borradorId, error: null, actualizadoEn: ahoraIso };
}

export function con_fallo(job: OcrJob, error: string, ahoraIso: string): OcrJob {
  return { ...job, estado: "fallo", error, actualizadoEn: ahoraIso };
}

export function con_recuerdo(job: OcrJob, ahoraIso: string): OcrJob {
  return { ...job, recordadoEn: ahoraIso, actualizadoEn: ahoraIso };
}

// Estado del borrador para GET: pendiente / confirmable (fecha+total no en
// baja → se puede confirmar) / vencida (7 días, solo lectura E5).
export function estado_borrador_api(input: {
  estadoBorrador: "pendiente" | "confirmada" | "descartada";
  venceAt: string;
  confianzaFechaBaja: boolean;
  confianzaTotalBaja: boolean;
  ahoraIso: string;
}): EstadoBorradorApi | "confirmada" | "descartada" {
  if (input.estadoBorrador !== "pendiente") return input.estadoBorrador;
  if (input.ahoraIso > input.venceAt) return "vencida";
  if (!input.confianzaFechaBaja && !input.confianzaTotalBaja) return "confirmable";
  return "pendiente";
}

// Recuerdo 24h: pendiente, no vencido, sin toque y aún no recordado.
export function necesita_recuerdo(input: { creadoEn: string; recordadoEn: string | null; venceAt: string; ahoraIso: string }): boolean {
  if (input.recordadoEn !== null) return false;
  if (input.ahoraIso > input.venceAt) return false;
  return Date.parse(input.ahoraIso) - Date.parse(input.creadoEn) >= RECUERDO_OCR_MS;
}

export function vencimiento_borrador_ms(): number {
  return VENCIMIENTO_BORRADOR_MS;
}
