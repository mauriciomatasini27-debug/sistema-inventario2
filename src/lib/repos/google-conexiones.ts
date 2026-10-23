import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getControlDb, getTenantDb } from "../db.js";
import {
  gmailConnectionEvents,
  gmailIngestionJobs,
  googleConnections,
} from "../../db/schema-google.js";
import { emailIngestionLog } from "../../db/schema-servicios.js";
import { kms_integraciones_desde_env, type Kms } from "../../modules/fiscal/kms.js";

// Repositorio de conexiones Google (ADR-0102). La fila vive en la base del
// tenant y el token solo se guarda cifrado. El AAD ata el ciphertext a
// (tenant, tipo, connection id); mover la fila invalida el descifrado.

const TIPO = "gmail";

function kmsPara(env: NodeJS.ProcessEnv, kms?: Kms): Kms {
  if (kms) return kms;
  const desdeEnv = kms_integraciones_desde_env(env);
  if (!desdeEnv) throw new Error("Falta INTEGRATIONS_KMS_KEY_B64");
  return desdeEnv;
}

function aad(tenantId: string, tipo: string, connectionId: string): string {
  return `${tenantId}:${tipo}:${connectionId}`;
}

// Id determinístico por (tenant, tipo): dos conexiones concurrentes generan
// el mismo id, así el AAD del token siempre coincide con la fila que gana.
function idConexion(tenantId: string, tipo: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(`google:${tenantId}:${tipo}`).digest(),
  );
  const b6 = bytes[6] ?? 0;
  const b8 = bytes[8] ?? 0;
  bytes[6] = (b6 & 0x0f) | 0x50;
  bytes[8] = (b8 & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export interface ConexionGmail {
  readonly id: string;
  readonly cuentaEmail: string;
  readonly scopes: ReadonlyArray<string>;
  readonly estado: string;
  readonly ultimoError: string | null;
  readonly consentimientoVersion: string;
  readonly createdAt: Date;
  readonly gmailHistoryCursor: string | null;
  readonly watchHistoryId: string | null;
  readonly watchExpiraAt: Date | null;
}

export interface SaludConexionGmail {
  readonly estado: "sin_conexion" | "activa" | "revocada" | "error";
  readonly cuentaEmail: string | null;
  readonly requiereReconexion: boolean;
  readonly avisoDueño: string | null;
  readonly watchActivo: boolean;
  readonly watchExpiraAt: string | null;
  readonly ultimaIngestaAt: string | null;
  readonly jobsPendientes: number;
}

export interface GuardarConexionGmailInput {
  readonly tenantId: string;
  readonly cuentaEmail: string;
  readonly scopes: ReadonlyArray<string>;
  readonly refreshToken: string | null;
  readonly consentimientoVersion: string;
  readonly consentidoPor: string;
  readonly kms?: Kms;
  readonly env?: NodeJS.ProcessEnv;
}

export async function guardarConexionGmail(
  input: GuardarConexionGmailInput,
): Promise<ConexionGmail> {
  const db = getTenantDb(input.tenantId);
  const [existente] = await db
    .select()
    .from(googleConnections)
    .where(
      and(
        eq(googleConnections.tenantId, input.tenantId),
        eq(googleConnections.tipo, TIPO),
      ),
    )
    .limit(1);

  const id = existente?.id ?? idConexion(input.tenantId, TIPO);
  const emailCambio = Boolean(existente && existente.cuentaEmail !== input.cuentaEmail);
  if (emailCambio && input.refreshToken === null) {
    throw new Error("Cambió la casilla y Google no devolvió refresh token");
  }
  const kms = kmsPara(input.env ?? process.env, input.kms);
  const token =
    input.refreshToken !== null
      ? await kms.encrypt(input.refreshToken, aad(input.tenantId, TIPO, id))
      : null;

  const tokenSet =
    token !== null
      ? {
          refreshTokenCifrado: token.ciphertextB64,
          refreshTokenIv: token.ivB64,
          refreshTokenTag: token.tagB64,
          cifradoVersion: token.version,
          kmsKeyId: token.keyId,
        }
      : {};

  if (!existente && token === null) {
    throw new Error("Google no devolvió refresh token");
  }

  await db
    .insert(googleConnections)
    .values({
      id,
      tenantId: input.tenantId,
      tipo: TIPO,
      cuentaEmail: input.cuentaEmail,
      scopes: [...input.scopes],
      estado: "activa",
      consentimientoVersion: input.consentimientoVersion,
      consentimientoAt: new Date(),
      consentidoPor: input.consentidoPor,
      cifradoVersion: token?.version ?? existente?.cifradoVersion ?? 1,
      ...(token !== null
        ? {
            refreshTokenCifrado: token.ciphertextB64,
            refreshTokenIv: token.ivB64,
            refreshTokenTag: token.tagB64,
            kmsKeyId: token.keyId,
          }
        : {}),
      ...(existente && !emailCambio
        ? {
            gmailHistoryCursor: existente.gmailHistoryCursor,
            watchHistoryId: existente.watchHistoryId,
            watchExpiraAt: existente.watchExpiraAt,
            photosAlbumes: existente.photosAlbumes,
          }
        : {}),
    })
    .onConflictDoUpdate({
      target: [googleConnections.tenantId, googleConnections.tipo],
      set: {
        cuentaEmail: input.cuentaEmail,
        scopes: [...input.scopes],
        estado: "activa",
        ultimoError: null,
        consentimientoVersion: input.consentimientoVersion,
        consentimientoAt: new Date(),
        consentidoPor: input.consentidoPor,
        updatedAt: new Date(),
        ...tokenSet,
        ...(emailCambio
          ? {
              gmailHistoryCursor: null,
              watchHistoryId: null,
              watchExpiraAt: null,
            }
          : {}),
      },
    });

  await db.insert(gmailConnectionEvents).values({
    tenantId: input.tenantId,
    connectionId: id,
    evento: "conectada",
    actor: input.consentidoPor,
  });

  return {
    id,
    cuentaEmail: input.cuentaEmail,
    scopes: [...input.scopes],
    estado: "activa",
    ultimoError: null,
    consentimientoVersion: input.consentimientoVersion,
    createdAt: existente?.createdAt ?? new Date(),
    gmailHistoryCursor: existente?.gmailHistoryCursor ?? null,
    watchHistoryId: existente?.watchHistoryId ?? null,
    watchExpiraAt: existente?.watchExpiraAt ?? null,
  };
}

export async function leerConexionGmail(
  tenantId: string,
): Promise<ConexionGmail | null> {
  const db = getTenantDb(tenantId);
  const [fila] = await db
    .select()
    .from(googleConnections)
    .where(
      and(eq(googleConnections.tenantId, tenantId), eq(googleConnections.tipo, TIPO)),
    )
    .limit(1);
  if (!fila) return null;
  return aConexion(fila);
}

function aConexion(fila: typeof googleConnections.$inferSelect): ConexionGmail {
  return {
    id: fila.id,
    cuentaEmail: fila.cuentaEmail,
    scopes: fila.scopes,
    estado: fila.estado,
    ultimoError: fila.ultimoError,
    consentimientoVersion: fila.consentimientoVersion,
    createdAt: fila.createdAt,
    gmailHistoryCursor: fila.gmailHistoryCursor,
    watchHistoryId: fila.watchHistoryId,
    watchExpiraAt: fila.watchExpiraAt,
  };
}

function avisoReconexion(estado: string, ultimoError: string | null): string | null {
  if (estado !== "revocada" && estado !== "error") return null;
  const motivo = ultimoError ?? "";
  if (motivo.includes("invalid_grant")) {
    return "Google revocó el acceso (invalid_grant). Volvé a conectar Gmail para seguir leyendo facturas.";
  }
  if (estado === "revocada" && motivo === "usuario") {
    return "Desconectaste Gmail. Podés volver a conectar cuando quieras.";
  }
  if (estado === "error") {
    return "Hay un error transitorio con Gmail. Reintentamos solos; si persiste, desconectá y volvé a conectar.";
  }
  if (estado === "revocada") {
    return "La conexión de Gmail ya no está activa. Volvé a conectar para retomar la ingesta.";
  }
  return null;
}

// GGL-PANEL: descarta la cola durable al desconectar (GGL-S4), sin tocar jobs ya cerrados.
export async function descartarJobsIngestaGmail(input: {
  readonly tenantId: string;
  readonly connectionId: string;
}): Promise<number> {
  const descartados = await getControlDb()
    .update(gmailIngestionJobs)
    .set({
      estado: "error",
      ultimoError: "descartado_desconexion",
      claimedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gmailIngestionJobs.tenantId, input.tenantId),
        eq(gmailIngestionJobs.connectionId, input.connectionId),
        inArray(gmailIngestionJobs.estado, ["pendiente", "procesando"]),
      ),
    )
    .returning({ id: gmailIngestionJobs.id });
  return descartados.length;
}

export async function leerSaludConexionGmail(tenantId: string): Promise<SaludConexionGmail> {
  const conexion = await leerConexionGmail(tenantId);
  if (!conexion) {
    return {
      estado: "sin_conexion",
      cuentaEmail: null,
      requiereReconexion: false,
      avisoDueño: null,
      watchActivo: false,
      watchExpiraAt: null,
      ultimaIngestaAt: null,
      jobsPendientes: 0,
    };
  }
  const dbTenant = getTenantDb(tenantId);
  const [ultimaLog] = await dbTenant
    .select({ createdAt: emailIngestionLog.createdAt })
    .from(emailIngestionLog)
    .orderBy(desc(emailIngestionLog.createdAt))
    .limit(1);
  const [pendientes] = await getControlDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(gmailIngestionJobs)
    .where(
      and(
        eq(gmailIngestionJobs.tenantId, tenantId),
        eq(gmailIngestionJobs.connectionId, conexion.id),
        inArray(gmailIngestionJobs.estado, ["pendiente", "procesando"]),
      ),
    );
  const ahora = Date.now();
  const watchActivo =
    conexion.estado === "activa" &&
    conexion.watchHistoryId !== null &&
    (conexion.watchExpiraAt === null || conexion.watchExpiraAt.getTime() > ahora);
  const estadoSalud =
    conexion.estado === "activa"
      ? "activa"
      : conexion.estado === "error"
        ? "error"
        : "revocada";
  const requiereReconexion =
    conexion.estado === "revocada" ||
    (conexion.estado === "error" && (conexion.ultimoError ?? "").includes("invalid_grant"));
  return {
    estado: estadoSalud,
    cuentaEmail: conexion.cuentaEmail,
    requiereReconexion,
    avisoDueño: avisoReconexion(conexion.estado, conexion.ultimoError),
    watchActivo,
    watchExpiraAt: conexion.watchExpiraAt?.toISOString() ?? null,
    ultimaIngestaAt: ultimaLog?.createdAt.toISOString() ?? null,
    jobsPendientes: pendientes?.total ?? 0,
  };
}

export async function leerConexionGmailPorId(
  tenantId: string,
  connectionId: string,
): Promise<ConexionGmail | null> {
  const db = getTenantDb(tenantId);
  const [fila] = await db
    .select()
    .from(googleConnections)
    .where(
      and(
        eq(googleConnections.tenantId, tenantId),
        eq(googleConnections.id, connectionId),
        eq(googleConnections.tipo, TIPO),
      ),
    )
    .limit(1);
  return fila ? aConexion(fila) : null;
}

export async function listarConexionesGmail(tenantId: string): Promise<ReadonlyArray<ConexionGmail>> {
  const db = getTenantDb(tenantId);
  const filas = await db
    .select()
    .from(googleConnections)
    .where(and(eq(googleConnections.tenantId, tenantId), eq(googleConnections.tipo, TIPO)));
  return filas.map(aConexion);
}

export async function actualizarWatchGmail(
  tenantId: string,
  input: { readonly watchHistoryId: string; readonly watchExpiraAt: Date },
): Promise<void> {
  await getTenantDb(tenantId)
    .update(googleConnections)
    .set({
      watchHistoryId: input.watchHistoryId,
      watchExpiraAt: input.watchExpiraAt,
      updatedAt: new Date(),
    })
    .where(and(eq(googleConnections.tenantId, tenantId), eq(googleConnections.tipo, TIPO)));
}

export async function actualizarCursorGmail(tenantId: string, cursor: string): Promise<void> {
  await getTenantDb(tenantId)
    .update(googleConnections)
    .set({ gmailHistoryCursor: cursor, updatedAt: new Date() })
    .where(and(eq(googleConnections.tenantId, tenantId), eq(googleConnections.tipo, TIPO)));
}

export async function descifrarRefreshTokenGmail(
  tenantId: string,
  kms?: Kms,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const db = getTenantDb(tenantId);
  const [fila] = await db
    .select()
    .from(googleConnections)
    .where(
      and(eq(googleConnections.tenantId, tenantId), eq(googleConnections.tipo, TIPO)),
    )
    .limit(1);
  if (
    !fila ||
    !fila.refreshTokenCifrado ||
    !fila.refreshTokenIv ||
    !fila.refreshTokenTag ||
    !fila.kmsKeyId
  ) {
    return null;
  }
  const kmsReal = kmsPara(env, kms);
  if (fila.kmsKeyId !== kmsReal.keyId) {
    throw new Error("La conexión se cifró con otra clave KMS");
  }
  return kmsReal.decrypt(
    {
      ciphertextB64: fila.refreshTokenCifrado,
      keyId: fila.kmsKeyId,
      ivB64: fila.refreshTokenIv,
      tagB64: fila.refreshTokenTag,
      version: fila.cifradoVersion,
    },
    aad(tenantId, TIPO, fila.id),
  );
}

export async function marcarConexionGmail(
  input: {
    readonly tenantId: string;
    readonly estado: "error" | "revocada";
    readonly evento: "error" | "desconectada";
    readonly motivo: string;
    readonly actor?: string | undefined;
  },
): Promise<void> {
  const db = getTenantDb(input.tenantId);
  const [fila] = await db
    .select({ id: googleConnections.id })
    .from(googleConnections)
    .where(
      and(
        eq(googleConnections.tenantId, input.tenantId),
        eq(googleConnections.tipo, TIPO),
      ),
    )
    .limit(1);
  if (!fila) return;
  await db
    .update(googleConnections)
    .set({
      estado: input.estado,
      ultimoError: input.motivo,
      updatedAt: new Date(),
      ...(input.estado === "revocada"
        ? {
            refreshTokenCifrado: null,
            refreshTokenIv: null,
            refreshTokenTag: null,
            kmsKeyId: null,
            watchHistoryId: null,
            watchExpiraAt: null,
          }
        : {}),
    })
    .where(eq(googleConnections.id, fila.id));
  await db.insert(gmailConnectionEvents).values({
    tenantId: input.tenantId,
    connectionId: fila.id,
    evento: input.evento,
    ...(input.actor !== undefined ? { actor: input.actor } : {}),
    motivo: input.motivo,
  });
}
