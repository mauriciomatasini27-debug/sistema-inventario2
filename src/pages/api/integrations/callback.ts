import type { APIRoute } from "astro";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import { guardarConexionGmail } from "../../../lib/repos/google-conexiones.js";
import {
  CONSENTIMIENTO_GOOGLE_VERSION,
  ErrorOAuthGoogle,
  SCOPES_GMAIL,
  cookieEstadoVacia,
  extraerCookie,
  intercambiarCodigoGmail,
  leerConfigIntegracionGmail,
  leerEstadoFirmado,
  verificarIdToken,
} from "../../../modules/integraciones/google-oauth.js";

export const prerender = false;

const COOKIE_STATE = "__Host-integrations-state";

function redirigir(destino: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: destino,
      "Set-Cookie": cookieEstadoVacia(),
      "Cache-Control": "no-store",
    },
  });
}

function redirigirError(codigo: string): Response {
  return redirigir(`/panel?google=error&motivo=${encodeURIComponent(codigo)}`);
}

// GET /api/integrations/callback — Google vuelve acá. El tenant sale del state
// firmado y de la sesión, nunca de la URL ni del body.
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const firmado = extraerCookie(request.headers.get("cookie"), COOKIE_STATE);
  if (!firmado) return redirigirError("sin_state");

  let estado;
  try {
    estado = leerEstadoFirmado(firmado);
  } catch {
    return redirigirError("state_invalido");
  }
  if (!estado || estado.tipo !== "gmail") return redirigirError("state_invalido");
  if (url.searchParams.get("state") !== estado.state) {
    return redirigirError("state_no_coincide");
  }

  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  if (
    dueno.ctx.googleSub !== estado.googleSub ||
    dueno.tenantId !== estado.tenantId
  ) {
    return redirigirError("state_ajeno");
  }

  const errorGoogle = url.searchParams.get("error");
  if (errorGoogle) return redirigirError(errorGoogle);
  const code = url.searchParams.get("code");
  if (!code) return redirigirError("sin_code");

  let config;
  try {
    config = leerConfigIntegracionGmail();
  } catch {
    return redirigirError("integracion_no_configurada");
  }

  try {
    const tokens = await intercambiarCodigoGmail({
      code,
      codeVerifier: estado.verifier,
      config,
    });
    if (!tokens.refreshToken) return redirigirError("sin_refresh_token");
    if (!tokens.idToken) return redirigirError("sin_id_token");
    const identidad = await verificarIdToken({
      idToken: tokens.idToken,
      expectedAud: config.clientId,
      nonceEsperado: estado.nonce,
    });
    await guardarConexionGmail({
      tenantId: estado.tenantId,
      cuentaEmail: identidad.email,
      scopes: tokens.scopes.length > 0 ? tokens.scopes : SCOPES_GMAIL,
      refreshToken: tokens.refreshToken,
      consentimientoVersion: CONSENTIMIENTO_GOOGLE_VERSION,
      consentidoPor: dueno.ctx.googleSub,
    });
    return redirigir("/panel?google=conectado");
  } catch (e) {
    const codigo = e instanceof ErrorOAuthGoogle ? e.codigo : "error_guardado";
    console.warn(
      "[integraciones] callback Gmail falló:",
      codigo,
      e instanceof Error ? e.message : "error",
    );
    return redirigirError(codigo);
  }
};
