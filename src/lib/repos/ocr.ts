import { and, desc, eq, sql } from "drizzle-orm";
import { ocrEventos, ocrJobs } from "../../db/schema.js";
import { dbVivaTenant } from "../server-db.js";
import { dondeTenant, filaConTenant } from "../tenant-scope.js";
import { con_borrador, type FallbackNubeApi, type OcrJob } from "../../modules/ocr/jobs.js";
import { crearAlmacenOcrJobs, crearAlmacenOcrJobsByKey, crearListaEventosOcr, type EventoOcr } from "./_almacen.js";

// PERS4-S2/S3 (ADR-0079): trabajos y eventos de OCR. DB primero vía
// dbVivaTenant(); solo en single sin base usa la memoria particionada. En
// multi sin base dbVivaTenant lanza BaseNoDisponible y se propaga (la ruta
// responde 503). La unicidad de idempotency_key sostiene el replay de
// Idempotency-Key (wamid/message-id). Sin proveedor de OCR cableado.

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
  return filaConTenant({
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
  });
}

// Por qué espejo: la memoria del proceso sigue hasta el retiro (P2.2).
function espejarJob(job: OcrJob): void {
  crearAlmacenOcrJobs().guardar(job.id, job);
  crearAlmacenOcrJobsByKey().guardar(job.idempotencyKey, job.id);
}

export async function buscarJobPorClave(key: string): Promise<OcrJob | null> {
  const almacenByKey = crearAlmacenOcrJobsByKey();
  const almacenJobs = crearAlmacenOcrJobs();
  const previoId = almacenByKey.obtener(key);
  const memoria = previoId ? (almacenJobs.obtener(previoId) ?? null) : null;
  const db = dbVivaTenant();
  if (!db) return memoria;
  try {
    const w = dondeTenant(ocrJobs.tenantId, eq(ocrJobs.idempotencyKey, key)) ?? eq(ocrJobs.idempotencyKey, key);
    const filas = await db.select().from(ocrJobs).where(w).limit(1);
    const fila = filas[0];
    if (!fila) return memoria;
    const job = jobDesdeFila(fila);
    espejarJob(job);
    return job;
  } catch (e) {
    almacenJobs.anteFalloPersistencia(e);
    return memoria;
  }
}

export async function obtenerJob(id: string): Promise<OcrJob | undefined> {
  const almacenJobs = crearAlmacenOcrJobs();
  const memoria = almacenJobs.obtener(id);
  const db = dbVivaTenant();
  if (!db) return memoria;
  try {
    const w = dondeTenant(ocrJobs.tenantId, eq(ocrJobs.id, id)) ?? eq(ocrJobs.id, id);
    const filas = await db.select().from(ocrJobs).where(w).limit(1);
    const fila = filas[0];
    if (!fila) return memoria;
    const job = jobDesdeFila(fila);
    espejarJob(job);
    return job;
  } catch (e) {
    almacenJobs.anteFalloPersistencia(e);
    return memoria;
  }
}

export async function listarJobs(): Promise<OcrJob[]> {
  const almacenJobs = crearAlmacenOcrJobs();
  const memoria = [...almacenJobs.comoMapaSoloLectura().values()];
  const db = dbVivaTenant();
  if (!db) return memoria;
  try {
    const w = dondeTenant(ocrJobs.tenantId);
    const filas = w ? await db.select().from(ocrJobs).where(w) : await db.select().from(ocrJobs);
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
    almacenJobs.anteFalloPersistencia(e);
    return memoria;
  }
}

export async function crearJobRegistro(job: OcrJob): Promise<OcrJob> {
  const almacenJobs = crearAlmacenOcrJobs();
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
    almacenJobs.anteFalloPersistencia(e);
    return job;
  }
}

export async function marcarJobFallo(job: OcrJob, error: string): Promise<OcrJob> {
  const almacenJobs = crearAlmacenOcrJobs();
  const fallido: OcrJob = { ...job, estado: "fallo", error };
  espejarJob(fallido);
  const db = dbVivaTenant();
  if (!db) return fallido;
  try {
    const w = dondeTenant(ocrJobs.tenantId, eq(ocrJobs.id, job.id)) ?? eq(ocrJobs.id, job.id);
    await db.update(ocrJobs).set({ estado: fallido.estado, error }).where(w);
    return fallido;
  } catch (e) {
    almacenJobs.anteFalloPersistencia(e);
    return fallido;
  }
}

export async function vincularBorradorAlJob(job: OcrJob, borradorId: string, ahoraIso: string): Promise<OcrJob> {
  const almacenJobs = crearAlmacenOcrJobs();
  const vinculado = con_borrador(job, borradorId, ahoraIso);
  espejarJob(vinculado);
  const db = dbVivaTenant();
  if (!db) return vinculado;
  try {
    await db
      .update(ocrJobs)
      .set({ estado: vinculado.estado, borradorId, actualizadoEn: new Date(ahoraIso) })
      .where(dondeTenant(ocrJobs.tenantId, eq(ocrJobs.id, job.id)) ?? eq(ocrJobs.id, job.id));
    return vinculado;
  } catch (e) {
    almacenJobs.anteFalloPersistencia(e);
    return vinculado;
  }
}

export async function actualizarJob(job: OcrJob): Promise<void> {
  const almacenJobs = crearAlmacenOcrJobs();
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
      .where(dondeTenant(ocrJobs.tenantId, eq(ocrJobs.id, job.id)) ?? eq(ocrJobs.id, job.id));
  } catch (e) {
    almacenJobs.anteFalloPersistencia(e);
  }
}

export async function registrarEventoOcr(tipo: string, payload: unknown): Promise<void> {
  const eventos = crearListaEventosOcr();
  eventos.agregar({ tipo, payload });
  const db = dbVivaTenant();
  if (!db) return;
  try {
    await db
      .insert(ocrEventos)
      .values(filaConTenant({ tipo, payload: payload as Record<string, unknown> }));
  } catch (e) {
    eventos.anteFalloPersistencia(e);
  }
}

function leerFallbackNube(payload: unknown): FallbackNubeApi {
  if (!payload || typeof payload !== "object") return null;
  return (payload as { fallback_nube?: unknown }).fallback_nube === "ofrecido" ? "ofrecido" : null;
}

function fallbackNubeEnMemoria(jobId: string): FallbackNubeApi {
  const eventos: EventoOcr[] = crearListaEventosOcr().listar();
  for (let i = eventos.length - 1; i >= 0; i--) {
    const e = eventos[i]!;
    const p = e.payload;
    if (e.tipo !== "ocr_borrador_listo" || !p || typeof p !== "object") continue;
    if ((p as { job_id?: unknown }).job_id === jobId) return leerFallbackNube(p);
  }
  return null;
}

// El fallback de nube vive en el evento `ocr_borrador_listo`, no en una columna
// nueva: GET lo deriva de lo ya persistido, sin migración. DB primero, memoria
// como espejo.
export async function buscarFallbackNubeJob(jobId: string): Promise<FallbackNubeApi> {
  const memoria = fallbackNubeEnMemoria(jobId);
  const db = dbVivaTenant();
  if (!db) return memoria;
  try {
    const filas = await db
      .select({ payload: ocrEventos.payload })
      .from(ocrEventos)
      .where(
        dondeTenant(
          ocrEventos.tenantId,
          and(eq(ocrEventos.tipo, "ocr_borrador_listo"), sql`${ocrEventos.payload}->>'job_id' = ${jobId}`),
        ) ?? and(eq(ocrEventos.tipo, "ocr_borrador_listo"), sql`${ocrEventos.payload}->>'job_id' = ${jobId}`),
      )
      .orderBy(desc(ocrEventos.creadoEn))
      .limit(1);
    const fila = filas[0];
    if (!fila) return memoria;
    return leerFallbackNube(fila.payload);
  } catch (e) {
    crearListaEventosOcr().anteFalloPersistencia(e);
    return memoria;
  }
}
