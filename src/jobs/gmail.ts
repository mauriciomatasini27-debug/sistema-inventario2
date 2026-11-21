import {
  ErrorGmailTransitorio,
  crearClienteGmail,
} from "../modules/integraciones/gmail-cliente.js";
import {
  ErrorOAuthGoogle,
  leerConfigIntegracionGmail,
  refrescarAccessTokenGmail,
} from "../modules/integraciones/google-oauth.js";
import { leerConfigPubSub } from "../modules/integraciones/pubsub.js";
import {
  actualizarWatchGmail,
  descifrarRefreshTokenGmail,
  leerConexionGmail,
  leerConexionGmailPorId,
  marcarConexionGmail,
  type ConexionGmail,
} from "../lib/repos/google-conexiones.js";
import { desactivarRutaWatch, guardarRutaWatch } from "../lib/repos/gmail-watch.js";
import {
  crearPersistenciaGmailDb,
  leerCatalogoCuentas,
  leerFiltrosIngesta,
} from "../lib/repos/gmail-ingesta.js";
import { marcarJobGmailError, marcarJobGmailHecho, type JobGmail } from "../lib/repos/gmail-cola.js";
import { sincronizarGmail } from "../modules/integraciones/gmail-sync.js";
import type { MotorOcr } from "../modules/ocr/motor.js";
import type { ExtractadorPdfDigital } from "../modules/utilities/extraer-pdf-digital.js";

export interface DepsJobGmail {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly motor?: MotorOcr | null;
  readonly extraerPdfTexto?: ExtractadorPdfDigital;
  readonly ahoraMs?: number;
  readonly actor?: string;
}

function envDe(deps: DepsJobGmail | undefined): NodeJS.ProcessEnv {
  return deps?.env ?? process.env;
}

async function tokenDeAcceso(
  tenantId: string,
  deps: DepsJobGmail | undefined,
): Promise<{ readonly ok: true; readonly token: string } | { readonly ok: false; readonly codigo: string; readonly transitorio: boolean }> {
  const env = envDe(deps);
  let refreshToken: string | null;
  try {
    refreshToken = await descifrarRefreshTokenGmail(tenantId, undefined, env);
  } catch (e) {
    return { ok: false, codigo: e instanceof Error ? e.message : "kms_error", transitorio: false };
  }
  if (!refreshToken) return { ok: false, codigo: "sin_refresh_token", transitorio: false };
  try {
    const r = await refrescarAccessTokenGmail({
      refreshToken,
      config: leerConfigIntegracionGmail(env),
      ...(deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
    return { ok: true, token: r.accessToken };
  } catch (e) {
    if (e instanceof ErrorOAuthGoogle) {
      const definitivo = e.codigo === "invalid_grant" || e.codigo === "invalid_client" || e.codigo === "unauthorized_client";
      return { ok: false, codigo: e.codigo, transitorio: e.codigo === "red" || !definitivo };
    }
    return { ok: false, codigo: e instanceof Error ? e.message : "oauth_error", transitorio: true };
  }
}

function reintentar(job: JobGmail): boolean {
  return job.intentos < 5;
}

async function revocarPorOAuth(tenantId: string, connectionId: string, codigo: string): Promise<void> {
  await marcarConexionGmail({
    tenantId,
    estado: "revocada",
    evento: "desconectada",
    motivo: `oauth:${codigo}`,
  });
  await desactivarRutaWatch({ tenantId, connectionId });
}

export async function ejecutarJobGmail(
  job: JobGmail,
  deps?: DepsJobGmail,
): Promise<"hecho" | "reintentar" | "error"> {
  const conexion = await leerConexionGmailPorId(job.tenantId, job.connectionId);
  if (!conexion || conexion.estado !== "activa") {
    await marcarJobGmailHecho(job.id);
    return "hecho";
  }

  const access = await tokenDeAcceso(job.tenantId, deps);
  if (!access.ok) {
    if (access.codigo === "invalid_grant" || access.codigo === "invalid_client" || access.codigo === "unauthorized_client") {
      await revocarPorOAuth(job.tenantId, job.connectionId, access.codigo);
    }
    await marcarJobGmailError({
      id: job.id,
      error: access.codigo,
      reintentar: access.transitorio && reintentar(job),
    });
    return access.transitorio && reintentar(job) ? "reintentar" : "error";
  }

  const gmail = crearClienteGmail({
    accessToken: access.token,
    ...(deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
  const filtros = await leerFiltrosIngesta(job.tenantId);
  const catalogo = await leerCatalogoCuentas(job.tenantId);
  try {
    await sincronizarGmail({
      gmail,
      connectionId: job.connectionId,
      cursor: conexion.gmailHistoryCursor,
      filtros,
      catalogo,
      ahoraMs: deps?.ahoraMs ?? Date.now(),
      motor: deps?.motor ?? null,
      ...(deps?.extraerPdfTexto !== undefined ? { extraerPdfTexto: deps.extraerPdfTexto } : {}),
      persistencia: crearPersistenciaGmailDb(job.tenantId),
    });

    await marcarJobGmailHecho(job.id);
    return "hecho";
  } catch (e) {
    const transitorio = e instanceof ErrorGmailTransitorio;
    const codigo = e instanceof Error ? e.message : "ingesta_error";
    await marcarJobGmailError({
      id: job.id,
      error: codigo,
      reintentar: transitorio && reintentar(job),
    });
    return transitorio && reintentar(job) ? "reintentar" : "error";
  }
}

export async function renovarWatchGmail(input: {
  readonly tenantId: string;
  readonly connectionId?: string;
  readonly deps?: DepsJobGmail;
}): Promise<{ readonly historyId: string; readonly expiraAt: Date }> {
  const conexion = input.connectionId
    ? await leerConexionGmailPorId(input.tenantId, input.connectionId)
    : await leerConexionGmail(input.tenantId);
  if (!conexion || conexion.estado !== "activa") {
    throw new ErrorOAuthGoogle("sin_conexion", "No hay una conexión Gmail activa");
  }
  const env = envDe(input.deps);
  const config = leerConfigPubSub(env);
  if (!env["GMAIL_ROUTE_PEPPER"]) {
    throw new ErrorOAuthGoogle("pubsub_no_configurado", "Falta GMAIL_ROUTE_PEPPER");
  }
  const access = await tokenDeAcceso(input.tenantId, input.deps);
  if (!access.ok) {
    if (access.codigo === "invalid_grant" || access.codigo === "invalid_client" || access.codigo === "unauthorized_client") {
      await revocarPorOAuth(input.tenantId, conexion.id, access.codigo);
    }
    throw new ErrorOAuthGoogle(access.codigo, "No se pudo renovar el acceso a Gmail");
  }
  await guardarRutaWatch({
    email: conexion.cuentaEmail,
    tenantId: input.tenantId,
    connectionId: conexion.id,
    env: envDe(input.deps),
  });
  const gmail = crearClienteGmail({
    accessToken: access.token,
    ...(input.deps?.fetchImpl ? { fetchImpl: input.deps.fetchImpl } : {}),
  });
  const labelIds =
    conexion.labels.length > 0 ? [...conexion.labels] : (["INBOX"] as const);
  const watch = await gmail.watch({ topicName: config.topic, labelIds });
  const expiraMs = Number(watch.expiration);
  const expiraAt = Number.isFinite(expiraMs) && expiraMs > 0 ? new Date(expiraMs) : new Date(Date.now() + 7 * 86_400_000);
  await actualizarWatchGmail(input.tenantId, { watchHistoryId: watch.historyId, watchExpiraAt: expiraAt });
  return { historyId: watch.historyId, expiraAt };
}

export async function detenerWatchGmail(input: {
  readonly tenantId: string;
  readonly deps?: DepsJobGmail;
}): Promise<void> {
  const conexion: ConexionGmail | null = await leerConexionGmail(input.tenantId);
  if (!conexion) return;
  const access = await tokenDeAcceso(input.tenantId, input.deps);
  if (access.ok) {
    const gmail = crearClienteGmail({
      accessToken: access.token,
      ...(input.deps?.fetchImpl ? { fetchImpl: input.deps.fetchImpl } : {}),
    });
    try {
      await gmail.stop();
    } catch (e) {
      console.warn("[gmail] no se pudo detener el watch:", e instanceof Error ? e.message : "error");
    }
  }
  await desactivarRutaWatch({ tenantId: input.tenantId, connectionId: conexion.id });
}
