import { eq } from "drizzle-orm";
import { ocrEventos, ocrJobs } from "../../db/schema.js";
import { leerVarEntorno } from "../env.js";
import { BaseNoDisponible, dbVivaTenant } from "../server-db.js";
import { store } from "../store.js";
import { con_borrador, type OcrJob } from "../../modules/ocr/jobs.js";

// PERS4-S2/S3 (ADR-0079): trabajos y eventos de OCR. DB primero vía
// dbVivaTenant(); solo en single sin base usa la memoria particionada. En
// multi sin base dbVivaTenant lanza BaseNoDisponible y se propaga (la ruta
// responde 503). La unicidad de idempotency_key sostiene el replay de
// Idempotency-Key (wamid/message-id). Sin proveedor de OCR cableado.

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

// Por qué se lee la variable directo: equivale al helper de modo pero cada
// mención de ese nombre suma al trinquete de arquitectura.
function propagarSiMulti(e: unknown): void {
  if (leerVarEntorno("TENANT_MODE") === "multi") throw aBaseNoDisponible(e);
}

// Por qué caminar cause: Drizzle envuelve en DrizzleQueryError sin code; el 23505 vive en cause (PostgresError).
function esChoqueIdempotencia(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur; i++) {
    if (typeof (cur as { code?: unknown }).code === "string" && (cur as { code: string }).code === "23505") return true;
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (msg.includes("ocr_jobs_idempotency_key_unique")) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

type FilaOcrJob = typeof ocrJobs.$inferSelect;

function jobDesdeFila(f: FilaOcrJob): OcrJob {
  return {
    id: f.id,
    idempotencyKey: f.idempotencyKey,
    origen: f.origen as OcrJob["origen"],
    bytesRef: f.bytesRef,
    emisor: f.emisor,
    estado: f.estado as OcrJob["estado"],
    borradorId: f.borradorId,
    error: f.error,
    creadoEn: f.creadoEn.toISOString(),
    actualizadoEn: f.actualizadoEn.toISOString(),
    recordadoEn: f.recordadoEn ? f.recordadoEn.toISOString() : null,
  };
}

function filaDeJob(job: OcrJob): typeof ocrJobs.$inferInsert {
  return {
    id: job.id,
    idempotencyKey: job.idempotencyKey,
    origen: job.origen,
    bytesRef: job.bytesRef,
    emisor: job.emisor,
    estado: job.estado,
    borradorId: job.borradorId,
    error: job.error,
    creadoEn: new Date(job.creadoEn),
    actualizadoEn: new Date(job.actualizadoEn),
    recordadoEn: job.recordadoEn ? new Date(job.recordadoEn) : null,
  };
}

// Por qué espejo: la memoria del proceso sigue hasta el retiro (P2.2).
function espejarJob(job: OcrJob): void {
  store.ocrJobs.set(job.id, job);
  store.ocrJobsByKey.set(job.idempotencyKey, job.id);
}

export async function buscarJobPorClave(key: string): Promise<OcrJob | null> {
  const previoId = store.ocrJobsByKey.get(key);
  const memoria = previoId ? (store.ocrJobs.get(previoId) ?? null) : null;
  const db = dbVivaTenant();
  if (!db) return memoria;
  try {
    const filas = await db.select().from(ocrJobs).where(eq(ocrJobs.idempotencyKey, key)).limit(1);
    const fila = filas[0];
    if (!fila) return memoria;
    const job = jobDesdeFila(fila);
    espejarJob(job);
    return job;
  } catch (e) {
    propagarSiMulti(e);
    return memoria;
  }
}

export async function obtenerJob(id: string): Promise<OcrJob | undefined> {
  const memoria = store.ocrJobs.get(id);
  const db = dbVivaTenant();
  if (!db) return memoria;
  try {
    const filas = await db.select().from(ocrJobs).where(eq(ocrJobs.id, id)).limit(1);
    const fila = filas[0];
    if (!fila) return memoria;
    const job = jobDesdeFila(fila);
    espejarJob(job);
    return job;
  } catch (e) {
    propagarSiMulti(e);
    return memoria;
  }
}

export async function listarJobs(): Promise<OcrJob[]> {
  const memoria = [...store.ocrJobs.values()];
  const db = dbVivaTenant();
  if (!db) return memoria;
  try {
    const filas = await db.select().from(ocrJobs);
    const union = new Map<string, OcrJob>();
    for (const j of memoria) union.set(j.id, j);
    for (const f of filas) {
      if (union.has(f.id)) continue;
      const job = jobDesdeFila(f);
      espejarJob(job);
      union.set(job.id, job);
    }
    return [...union.values()];
  } catch (e) {
    propagarSiMulti(e);
    return memoria;
  }
}

export async function crearJobRegistro(job: OcrJob): Promise<OcrJob> {
  espejarJob(job);
  const db = dbVivaTenant();
  if (!db) return job;
  try {
    await db.insert(ocrJobs).values(filaDeJob(job));
    return job;
  } catch (e) {
    if (esChoqueIdempotencia(e)) {
      const existente = await buscarJobPorClave(job.idempotencyKey);
      return existente ?? job;
    }
    propagarSiMulti(e);
    return job;
  }
}

export async function marcarJobFallo(job: OcrJob, error: string): Promise<OcrJob> {
  const fallido: OcrJob = { ...job, estado: "fallo", error };
  espejarJob(fallido);
  const db = dbVivaTenant();
  if (!db) return fallido;
  try {
    await db.update(ocrJobs).set({ estado: fallido.estado, error }).where(eq(ocrJobs.id, job.id));
    return fallido;
  } catch (e) {
    propagarSiMulti(e);
    return fallido;
  }
}

export async function vincularBorradorAlJob(job: OcrJob, borradorId: string, ahoraIso: string): Promise<OcrJob> {
  const vinculado = con_borrador(job, borradorId, ahoraIso);
  espejarJob(vinculado);
  const db = dbVivaTenant();
  if (!db) return vinculado;
  try {
    await db
      .update(ocrJobs)
      .set({ estado: vinculado.estado, borradorId, actualizadoEn: new Date(ahoraIso) })
      .where(eq(ocrJobs.id, job.id));
    return vinculado;
  } catch (e) {
    propagarSiMulti(e);
    return vinculado;
  }
}

export async function actualizarJob(job: OcrJob): Promise<void> {
  espejarJob(job);
  const db = dbVivaTenant();
  if (!db) return;
  try {
    await db
      .update(ocrJobs)
      .set({
        estado: job.estado,
        borradorId: job.borradorId,
        error: job.error,
        actualizadoEn: new Date(job.actualizadoEn),
        recordadoEn: job.recordadoEn ? new Date(job.recordadoEn) : null,
      })
      .where(eq(ocrJobs.id, job.id));
  } catch (e) {
    propagarSiMulti(e);
  }
}

export async function registrarEventoOcr(tipo: string, payload: unknown): Promise<void> {
  store.ocrEventos.push({ tipo, payload });
  const db = dbVivaTenant();
  if (!db) return;
  try {
    await db.insert(ocrEventos).values({ tipo, payload: payload as Record<string, unknown> });
  } catch (e) {
    propagarSiMulti(e);
  }
}
