import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getTenantDb } from "../db.js";
import {
  gmailConnectionEvents,
  googleConnections,
} from "../../db/schema-google.js";
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
  readonly consentimientoVersion: string;
  readonly createdAt: Date;
  readonly gmailHistoryCursor: string | null;
  readonly watchHistoryId: string | null;
  readonly watchExpiraAt: Date | null;
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
    consentimientoVersion: fila.consentimientoVersion,
    createdAt: fila.createdAt,
    gmailHistoryCursor: fila.gmailHistoryCursor,
    watchHistoryId: fila.watchHistoryId,
    watchExpiraAt: fila.watchExpiraAt,
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
