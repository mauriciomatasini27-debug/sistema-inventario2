import { and, asc, eq, lt, lte, or } from "drizzle-orm";
import { gmailIngestionJobs } from "../../db/schema-google.js";
import { getControlDb } from "../db.js";

export type MotivoJobGmail = "push" | "poll" | "inicial";
export type EstadoJobGmail = "pendiente" | "procesando" | "hecho" | "error";

export interface JobGmail {
  readonly id: string;
  readonly tenantId: string;
  readonly connectionId: string;
  readonly historyId: string;
  readonly motivo: MotivoJobGmail;
  readonly intentos: number;
}

export interface EncolarIngestaInput {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly historyId: string;
  readonly messageId?: string | null;
  readonly motivo: MotivoJobGmail;
}

function aJob(fila: typeof gmailIngestionJobs.$inferSelect): JobGmail {
  return {
    id: fila.id,
    tenantId: fila.tenantId,
    connectionId: fila.connectionId,
    historyId: fila.historyId,
    motivo: fila.motivo as MotivoJobGmail,
    intentos: fila.intentos,
  };
}

export async function encolarIngesta(input: EncolarIngestaInput): Promise<JobGmail | null> {
  const db = getControlDb();
  // GGL-P240-FIX: dedupe por messageId solo dentro del mismo comercio.
  // El índice único en DB sigue siendo global sobre message_id (0048); ver nota en el PR.
  if (input.messageId) {
    const [existentePorMessageId] = await db
      .select()
      .from(gmailIngestionJobs)
      .where(
        and(
          eq(gmailIngestionJobs.tenantId, input.tenantId),
          eq(gmailIngestionJobs.messageId, input.messageId),
        ),
      )
      .limit(1);
    if (existentePorMessageId) {
      return aJob(existentePorMessageId);
    }
  }

  let messageId = input.messageId ?? null;
  if (messageId) {
    const [ocupadoEnOtroTenant] = await db
      .select({ tenantId: gmailIngestionJobs.tenantId })
      .from(gmailIngestionJobs)
      .where(eq(gmailIngestionJobs.messageId, messageId))
      .limit(1);
    // GGL-P240-FIX: el índice 0048 es único solo por message_id; otro comercio
    // no puede reutilizar la columna hasta migrar a UNIQUE (tenant_id, message_id).
    if (ocupadoEnOtroTenant && ocupadoEnOtroTenant.tenantId !== input.tenantId) {
      messageId = null;
    }
  }

  const [creado] = await db
    .insert(gmailIngestionJobs)
    .values({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      historyId: input.historyId,
      messageId,
      motivo: input.motivo,
    })
    .onConflictDoNothing({
      target: [gmailIngestionJobs.connectionId, gmailIngestionJobs.historyId],
    })
    .returning();
  if (creado) return aJob(creado);
  const [existente] = await db
    .select()
    .from(gmailIngestionJobs)
    .where(
      and(
        eq(gmailIngestionJobs.connectionId, input.connectionId),
        eq(gmailIngestionJobs.historyId, input.historyId),
      ),
    )
    .limit(1);
  return existente ? aJob(existente) : null;
}

export async function encolarPolling(input: {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly cursor: string | null;
}): Promise<JobGmail> {
  const historyId = input.cursor ?? `inicial:${Date.now()}`;
  const db = getControlDb();
  const [creado] = await db
    .insert(gmailIngestionJobs)
    .values({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      historyId: `${historyId}:poll:${Date.now()}:${crypto.randomUUID()}`,
      motivo: input.cursor === null ? "inicial" : "poll",
    })
    .returning();
  if (!creado) throw new Error("No se pudo encolar el polling de Gmail");
  return aJob(creado);
}

export async function reclamarJobsGmail(input: {
  readonly tenantId?: string;
  readonly limite: number;
  readonly ahora?: Date;
  readonly staleMs?: number;
}): Promise<ReadonlyArray<JobGmail>> {
  const ahora = input.ahora ?? new Date();
  const stale = new Date(ahora.getTime() - (input.staleMs ?? 10 * 60_000));
  const db = getControlDb();
  return db.transaction(async (tx) => {
    const filas = await tx
      .select()
      .from(gmailIngestionJobs)
      .where(
        and(
          input.tenantId ? eq(gmailIngestionJobs.tenantId, input.tenantId) : undefined,
          or(
            and(eq(gmailIngestionJobs.estado, "pendiente"), lte(gmailIngestionJobs.runAt, ahora)),
            and(eq(gmailIngestionJobs.estado, "procesando"), lt(gmailIngestionJobs.claimedAt, stale)),
          ),
        ),
      )
      .orderBy(asc(gmailIngestionJobs.createdAt))
      .limit(input.limite)
      .for("update", { skipLocked: true });
    for (const fila of filas) {
      await tx
        .update(gmailIngestionJobs)
        .set({ estado: "procesando", claimedAt: ahora, updatedAt: ahora })
        .where(eq(gmailIngestionJobs.id, fila.id));
    }
    return filas.map(aJob);
  });
}

export async function marcarJobGmailHecho(id: string): Promise<void> {
  await getControlDb()
    .update(gmailIngestionJobs)
    .set({ estado: "hecho", ultimoError: null, updatedAt: new Date() })
    .where(eq(gmailIngestionJobs.id, id));
}

export async function marcarJobGmailError(input: {
  readonly id: string;
  readonly error: string;
  readonly reintentar: boolean;
  readonly runAt?: Date;
}): Promise<void> {
  const db = getControlDb();
  const [fila] = await db
    .select({ intentos: gmailIngestionJobs.intentos })
    .from(gmailIngestionJobs)
    .where(eq(gmailIngestionJobs.id, input.id))
    .limit(1);
  if (!fila) return;
  const intentos = fila.intentos + 1;
  await db
    .update(gmailIngestionJobs)
    .set(
      input.reintentar
        ? {
            estado: "pendiente",
            intentos,
            claimedAt: null,
            ultimoError: input.error,
            runAt: input.runAt ?? new Date(Date.now() + Math.min(2 ** intentos, 60) * 60_000),
            updatedAt: new Date(),
          }
        : {
            estado: "error",
            intentos,
            claimedAt: null,
            ultimoError: input.error,
            updatedAt: new Date(),
          },
    )
    .where(eq(gmailIngestionJobs.id, input.id));
}
