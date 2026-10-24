import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// OAuth de integraciones (ADR-0102). Cliente separado del login y scopes
// mínimos. El refresh token solo sale de acá hacia el repositorio cifrado;
// nunca se loguea ni se devuelve al navegador.

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export const CONSENTIMIENTO_GOOGLE_VERSION = "2026-10-19-v1";

// GGL-S12: sin GOOGLE_INTEGRATIONS_MODO la app sigue en testing. Google no
// verificó gmail.readonly, el refresh vence a los 7 días y solo la lista abre OAuth.
export const LIMITE_USUARIOS_PRUEBA_GMAIL = 100;

export const TEXTO_FUERA_DE_LISTA_PRUEBA =
  "Gmail está en modo prueba de Google. Solo las cuentas de la lista de prueba pueden conectar, y esa lista admite hasta 100 personas. Tu cuenta no está en la lista, así que no abrimos el permiso de Google. Pedile a quien administra la app que te agregue, o esperá a que Google verifique la app.";

export const TEXTO_REFRESH_7_DIAS =
  "Google está en modo Testing. El permiso para renovar la conexión vence a los 7 días. Cuando venza, volvé a conectar desde acá. Después de ese vencimiento la lectura de facturas no sigue sola.";

export const TEXTO_LISTA_PRUEBA_INVALIDA =
  "No podemos abrir el permiso de Google. La lista de prueba está mal configurada. Tiene que decir testing o verificada, y en testing no puede pasar de 100 cuentas.";

export type ModoAppGmail =
  | { readonly tipo: "verificada" }
  | { readonly tipo: "testing"; readonly usuarios: ReadonlySet<string> };

export type DecisionInicioGmail =
  | { readonly iniciar: true; readonly modo: "testing" | "verificada" }
  | { readonly iniciar: false; readonly motivo: "fuera_de_lista" | "config_invalida" };

export interface VistaModoPruebaGmail {
  readonly mostrarFormulario: boolean;
  readonly textoLimite: string | null;
  readonly textoRefresh7Dias: string | null;
}

export function normalizarEmailPrueba(crudo: string): string | null {
  const email = crudo.trim().toLowerCase();
  if (!email || /\s/.test(email) || !email.includes("@")) return null;
  return email;
}

function emailsDeListaPrueba(crudo: string): Set<string> | null {
  const usuarios = new Set<string>();
  for (const parte of crudo.split(",")) {
    const email = normalizarEmailPrueba(parte);
    if (email) usuarios.add(email);
  }
  if (usuarios.size > LIMITE_USUARIOS_PRUEBA_GMAIL) return null;
  return usuarios;
}

export function leerModoAppGmail(
  env: NodeJS.ProcessEnv = process.env,
): { readonly ok: true; readonly modo: ModoAppGmail } | { readonly ok: false; readonly motivo: "config_invalida" } {
  const crudo = (env["GOOGLE_INTEGRATIONS_MODO"] ?? "").trim().toLowerCase();
  const modo = crudo === "" ? "testing" : crudo;
  if (modo === "verificada") return { ok: true, modo: { tipo: "verificada" } };
  if (modo !== "testing") return { ok: false, motivo: "config_invalida" };
  const usuarios = emailsDeListaPrueba(env["GOOGLE_INTEGRATIONS_USUARIOS_PRUEBA"] ?? "");
  if (!usuarios) return { ok: false, motivo: "config_invalida" };
  return { ok: true, modo: { tipo: "testing", usuarios } };
}

export function decidirInicioGmail(input: {
  readonly email: string;
  readonly env?: NodeJS.ProcessEnv | undefined;
}): DecisionInicioGmail {
  const lectura = leerModoAppGmail(input.env);
  if (!lectura.ok) return { iniciar: false, motivo: "config_invalida" };
  if (lectura.modo.tipo === "verificada") return { iniciar: true, modo: "verificada" };
  const email = normalizarEmailPrueba(input.email);
  if (!email || !lectura.modo.usuarios.has(email)) {
    return { iniciar: false, motivo: "fuera_de_lista" };
  }
  return { iniciar: true, modo: "testing" };
}

// GGL-S12: el límite se explica solo al Dueño. Al empleado ya lo frena el rol.
export function vistaModoPruebaGmail(input: {
  readonly decision: DecisionInicioGmail;
  readonly hayConexion: boolean;
  readonly esDueno: boolean;
}): VistaModoPruebaGmail {
  const decision = input.decision;
  if (!decision.iniciar && input.esDueno) {
    const enTesting = decision.motivo === "fuera_de_lista";
    return {
      mostrarFormulario: false,
      textoLimite: enTesting ? TEXTO_FUERA_DE_LISTA_PRUEBA : TEXTO_LISTA_PRUEBA_INVALIDA,
      textoRefresh7Dias: enTesting && input.hayConexion ? TEXTO_REFRESH_7_DIAS : null,
    };
  }
  if (!decision.iniciar) {
    return {
      mostrarFormulario: true,
      textoLimite: null,
      textoRefresh7Dias: decision.motivo === "fuera_de_lista" ? TEXTO_REFRESH_7_DIAS : null,
    };
  }
  return {
    mostrarFormulario: true,
    textoLimite: null,
    textoRefresh7Dias: decision.modo === "testing" ? TEXTO_REFRESH_7_DIAS : null,
  };
}

export const SCOPES_GMAIL = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

export interface ConfigIntegracionGoogle {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

export function generarPKCE(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export function nuevoState(): string {
  return randomBytes(24).toString("base64url");
}

export function nuevoNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function leerConfigIntegracionGmail(
  env: NodeJS.ProcessEnv = process.env,
): ConfigIntegracionGoogle {
  const clientId = env["GOOGLE_INTEGRATIONS_CLIENT_ID"] ?? "";
  const clientSecret = env["GOOGLE_INTEGRATIONS_CLIENT_SECRET"] ?? "";
  const redirectUri = env["GOOGLE_INTEGRATIONS_REDIRECT"] ?? "";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Falta GOOGLE_INTEGRATIONS_CLIENT_ID/SECRET/REDIRECT");
  }
  return { clientId, clientSecret, redirectUri };
}

export function construirUrlAutorizacionGmail(input: {
  readonly config: ConfigIntegracionGoogle;
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  readonly loginHint?: string | undefined;
  readonly prompt?: "consent" | "select_account" | undefined;
}): string {
  const q = new URLSearchParams({
    client_id: input.config.clientId,
    redirect_uri: input.config.redirectUri,
    response_type: "code",
    scope: SCOPES_GMAIL.join(" "),
    access_type: "offline",
    prompt: input.prompt ?? "consent",
    include_granted_scopes: "true",
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  if (input.loginHint) q.set("login_hint", input.loginHint);
  return `${GOOGLE_AUTH_ENDPOINT}?${q.toString()}`;
}

export class ErrorOAuthGoogle extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorOAuthGoogle";
  }
}

export interface TokensGoogle {
  readonly refreshToken: string | null;
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly scopes: ReadonlyArray<string>;
  readonly idToken: string | null;
}

export async function intercambiarCodigoGmail(input: {
  readonly code: string;
  readonly codeVerifier: string;
  readonly config: ConfigIntegracionGoogle;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<TokensGoogle> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });
  const r = await (input.fetchImpl ?? fetch)(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  let data: {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
    id_token?: unknown;
    error?: unknown;
  };
  try {
    data = (await r.json()) as typeof data;
  } catch {
    throw new ErrorOAuthGoogle(
      r.ok ? "respuesta_invalida" : `http_${r.status}`,
      "Google devolvió una respuesta inválida",
    );
  }
  if (!r.ok) {
    const codigo = typeof data.error === "string" ? data.error : `http_${r.status}`;
    throw new ErrorOAuthGoogle(codigo, "No se pudo conectar con Google");
  }
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new ErrorOAuthGoogle("sin_access_token", "Google no devolvió access token");
  }
  return {
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    accessToken: data.access_token,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : 0,
    scopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : [],
    idToken: typeof data.id_token === "string" ? data.id_token : null,
  };
}

export interface AccessTokenGmail {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly scopes: ReadonlyArray<string>;
}

export async function refrescarAccessTokenGmail(input: {
  readonly refreshToken: string;
  readonly config: ConfigIntegracionGoogle;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<AccessTokenGmail> {
  const body = new URLSearchParams({
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  });
  let r: Response;
  try {
    r = await (input.fetchImpl ?? fetch)(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    throw new ErrorOAuthGoogle("red", "No se pudo contactar a Google");
  }
  let data: {
    access_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
    error?: unknown;
  };
  try {
    data = (await r.json()) as typeof data;
  } catch {
    throw new ErrorOAuthGoogle(
      r.ok ? "respuesta_invalida" : `http_${r.status}`,
      "Google devolvió una respuesta inválida",
    );
  }
  if (!r.ok) {
    const codigo = typeof data.error === "string" ? data.error : `http_${r.status}`;
    throw new ErrorOAuthGoogle(codigo, "Google no renovó el acceso");
  }
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new ErrorOAuthGoogle("sin_access_token", "Google no devolvió access token");
  }
  return {
    accessToken: data.access_token,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : 0,
    scopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : [],
  };
}

export interface IdentidadGoogle {
  readonly sub: string;
  readonly email: string;
  readonly emailVerificado: boolean;
  readonly nonce: string | null;
}

export async function verificarIdToken(input: {
  readonly idToken: string;
  readonly expectedAud: string;
  readonly nonceEsperado: string;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<IdentidadGoogle> {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(input.idToken)}`;
  const r = await (input.fetchImpl ?? fetch)(url);
  let data: {
    aud?: unknown;
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    nonce?: unknown;
    iss?: unknown;
  };
  try {
    data = (await r.json()) as typeof data;
  } catch {
    throw new ErrorOAuthGoogle("id_token_invalido", "Google devolvió una respuesta inválida");
  }
  if (!r.ok) {
    throw new ErrorOAuthGoogle("id_token_invalido", "Google rechazó el id token");
  }
  const aud: unknown[] = Array.isArray(data.aud) ? data.aud : [data.aud];
  if (!aud.includes(input.expectedAud)) {
    throw new ErrorOAuthGoogle("aud_invalida", "El id token es de otro cliente");
  }
  if (
    data.iss !== "https://accounts.google.com" &&
    data.iss !== "accounts.google.com"
  ) {
    throw new ErrorOAuthGoogle("iss_invalido", "El id token no lo emitió Google");
  }
  if (typeof data.sub !== "string" || !data.sub) {
    throw new ErrorOAuthGoogle("sin_sub", "El id token no trae la cuenta");
  }
  if (typeof data.email !== "string" || !data.email) {
    throw new ErrorOAuthGoogle("sin_email", "El id token no trae el correo");
  }
  const verificado = data.email_verified === true || data.email_verified === "true";
  if (!verificado) {
    throw new ErrorOAuthGoogle("email_no_verificado", "El correo de Google no está verificado");
  }
  if (input.nonceEsperado && data.nonce !== input.nonceEsperado) {
    throw new ErrorOAuthGoogle("nonce_invalido", "El nonce no coincide");
  }
  return {
    sub: data.sub,
    email: data.email,
    emailVerificado: true,
    nonce: typeof data.nonce === "string" ? data.nonce : null,
  };
}

export async function revocarTokenGoogle(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const r = await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  if (!r.ok && r.status !== 400) {
    throw new ErrorOAuthGoogle("revoke_fallo", "No se pudo revocar el acceso en Google");
  }
}

export interface EstadoIntegracion {
  readonly state: string;
  readonly verifier: string;
  readonly nonce: string;
  readonly tenantId: string;
  readonly googleSub: string;
  readonly tipo: "gmail" | "photos";
  readonly exp: number;
}

function secretoEstado(env: NodeJS.ProcessEnv = process.env): string {
  const secreto = env["INTEGRATIONS_STATE_SECRET"] ?? env["JOBS_SECRET"] ?? "";
  if (!secreto) throw new Error("Falta INTEGRATIONS_STATE_SECRET");
  return secreto;
}

function firmaEstado(payload: string, secreto: string): string {
  return createHmac("sha256", secreto).update(payload).digest("base64url");
}

export function firmarEstado(
  estado: EstadoIntegracion,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const payload = Buffer.from(JSON.stringify(estado), "utf8").toString("base64url");
  return `${payload}.${firmaEstado(payload, secretoEstado(env))}`;
}

export function leerEstadoFirmado(
  valor: string,
  env: NodeJS.ProcessEnv = process.env,
  ahoraMs: number = Date.now(),
): EstadoIntegracion | null {
  const [payload, firma] = valor.split(".");
  if (!payload || !firma) return null;
  const esperada = firmaEstado(payload, secretoEstado(env));
  const a = Buffer.from(firma, "utf8");
  const b = Buffer.from(esperada, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (
    typeof p["state"] !== "string" ||
    typeof p["verifier"] !== "string" ||
    typeof p["nonce"] !== "string" ||
    typeof p["tenantId"] !== "string" ||
    typeof p["googleSub"] !== "string" ||
    (p["tipo"] !== "gmail" && p["tipo"] !== "photos") ||
    typeof p["exp"] !== "number"
  ) {
    return null;
  }
  if (p["exp"] <= ahoraMs) return null;
  return {
    state: p["state"],
    verifier: p["verifier"],
    nonce: p["nonce"],
    tenantId: p["tenantId"],
    googleSub: p["googleSub"],
    tipo: p["tipo"],
    exp: p["exp"],
  };
}

export function extraerCookie(header: string | null, nombre: string): string | null {
  if (!header) return null;
  for (const parte of header.split(";")) {
    const i = parte.indexOf("=");
    if (i <= 0) continue;
    if (parte.slice(0, i).trim() === nombre) {
      const valor = parte.slice(i + 1).trim();
      return valor || null;
    }
  }
  return null;
}

export function cookieEstado(valor: string): string {
  return `__Host-integrations-state=${valor}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}

export function cookieEstadoVacia(): string {
  return "__Host-integrations-state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}
