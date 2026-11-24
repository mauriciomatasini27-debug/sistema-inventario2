import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { leerVarEntorno } from "../../lib/env.js";

// OIDC Google, Authorization Code + PKCE S256 del lado servidor (AU1).
// El navegador solo recibe redirecciones; el ID token se valida y se descarta.
export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
// Por qué solo estos tres: el login nunca pide Gmail/Photos (AU3). Esos scopes
// viven en la app de integraciones, con otro cliente OAuth y otro consentimiento.
export const LOGIN_SCOPES = "openid email profile";

export interface ConfigLogin {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function leerConfigLogin(env: NodeJS.ProcessEnv = process.env): ConfigLogin {
  const clientId = leerVarEntorno("GOOGLE_LOGIN_CLIENT_ID", env);
  const clientSecret = leerVarEntorno("GOOGLE_LOGIN_CLIENT_SECRET", env);
  const redirectUri = leerVarEntorno("GOOGLE_LOGIN_REDIRECT", env);
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Falta GOOGLE_LOGIN_CLIENT_ID/SECRET/REDIRECT");
  }
  return { clientId, clientSecret, redirectUri };
}

export function generarPKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function nuevoState(): string {
  return randomBytes(16).toString("base64url");
}

export function nuevoNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function buildAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  prompt?: string | undefined;
  loginHint?: string | undefined;
  maxAge?: number | undefined;
}): string {
  const q = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: LOGIN_SCOPES,
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  // AU10.2: la reauth pide elegir cuenta explícitamente; login_hint evita
  // que el Dueño confirme con otra cuenta por error.
  if (input.prompt) q.set("prompt", input.prompt);
  if (input.loginHint) q.set("login_hint", input.loginHint);
  if (input.maxAge !== undefined) q.set("max_age", String(input.maxAge));
  return `${GOOGLE_AUTH_ENDPOINT}?${q.toString()}`;
}

export interface IdentidadGoogle {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nombre?: string | undefined;
  fotoUrl?: string | undefined;
  // AU10.2: ms del `iat` del ID token para exigir token recién emitido.
  iatMs?: number | undefined;
  nonce?: unknown;
}

// Por qué sub como identidad estable: el email puede cambiar y se actualiza en
// cada login; solo empareja invitaciones (AU1.5). Normalización: lowercase, sin
// tocar puntos (pregunta abierta AU6.4).
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function verificarIdToken(input: {
  idToken: string;
  expectedAud: string;
  nonceEsperado?: string | undefined;
  jwksUrl?: string | undefined;
  clave?: JWTVerifyGetKey | undefined;
}): Promise<IdentidadGoogle> {
  const key: JWTVerifyGetKey = input.clave ?? createRemoteJWKSet(new URL(input.jwksUrl ?? GOOGLE_JWKS_URL));
  const { payload } = await jwtVerify(input.idToken, key, {
    issuer: GOOGLE_ISSUERS,
    audience: input.expectedAud,
  });
  if (input.nonceEsperado !== undefined && payload.nonce !== input.nonceEsperado) {
    throw new Error("nonce distinto");
  }
  if (payload.email_verified !== true) {
    throw new Error("Tu cuenta de Google no tiene el email verificado");
  }
  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== "string" || !sub || typeof email !== "string" || !email) {
    throw new Error("ID token sin sub o email");
  }
  const nombre = typeof payload.name === "string" ? payload.name : undefined;
  const fotoUrl = typeof payload.picture === "string" ? payload.picture : undefined;
  const iatMs = typeof payload.iat === "number" ? payload.iat * 1000 : undefined;
  return { sub, email, emailVerificado: true, nombre, fotoUrl, iatMs, nonce: payload.nonce };
}

export async function intercambiarCodigo(input: {
  code: string;
  codeVerifier: string;
  config: ConfigLogin;
}): Promise<{ idToken: string }> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });
  const r = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => "");
    throw new Error(`No se pudo completar el ingreso con Google (HTTP ${r.status}): ${detalle}`);
  }
  const data = (await r.json()) as { id_token?: string };
  // Por qué no se guarda: AU2.2, el ID token se valida y se descarta.
  if (!data.id_token) throw new Error("Google no devolvió ID token");
  return { idToken: data.id_token };
}
