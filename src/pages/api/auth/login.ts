import type { APIRoute } from "astro";
import {
  buildAuthorizationUrl,
  generarPKCE,
  leerConfigLogin,
  nuevoNonce,
  nuevoState,
} from "../../../modules/auth/oidc.js";
import { control } from "../../../lib/store.js";
import { jsonError } from "../../../lib/control.js";

export const prerender = false;

const COOKIE_BASE = "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600";

function cookieHost(nombre: string, valor: string): string {
  // P1-24: encode evita que un next=/panel u otros caracteres rompan Set-Cookie.
  return `${nombre}=${encodeURIComponent(valor)}; ${COOKIE_BASE}`;
}

// P1-55: 302 same-origin al hop, no HTML con setTimeout(200) ni 302 cross-site
// a Google. El browser aplica Set-Cookie antes de pedir /api/auth/hacia-google;
// ese hop recién manda a accounts.google.com. Así no hay carrera de jar.
function respuestaHaciaHop(setCookies: string[], destino: string): Response {
  const headers = new Headers({
    Location: `/api/auth/hacia-google?d=${encodeURIComponent(destino)}`,
    "Cache-Control": "no-store",
  });
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

// GET /api/auth/login — prepara PKCE/state/nonce y salta al hop same-origin.
// El verifier/nonce viajan en cookies HttpOnly de un solo uso, nunca en el
// ID token; el intercambio del código lo hace el callback en el servidor.
export const GET: APIRoute = async ({ request }) => {
  let config;
  try {
    config = leerConfigLogin();
  } catch {
    return jsonError("Falta configurar GOOGLE_LOGIN_CLIENT_ID/SECRET/REDIRECT", 500);
  }
  const url = new URL(request.url);
  const invitationToken = url.searchParams.get("invitation_token") ?? undefined;
  // AU13.1: "Cambiar de usuario" vuelve acá con prompt=select_account para
  // forzar el selector de cuentas. Solo se admite ese valor (allowlist).
  const prompt = url.searchParams.get("prompt") === "select_account" ? "select_account" : undefined;
  const { verifier, challenge } = generarPKCE();
  const state = nuevoState();
  const nonce = nuevoNonce();
  const nextRaw = url.searchParams.get("next") ?? undefined;
  const next = nextRaw && ["/panel", "/admin", "/"].includes(nextRaw) ? nextRaw : undefined;
  control.pendingAuth.set(state, { nonce, verifier, invitationToken, expiraEnMs: Date.now() + 10 * 60_000, ...(next ? { next } : {}) });
  // Por qué cookies y no query persistente: el state/nonce no deben quedar en
  // el historial ni en logs; se consumen en el callback y se borran.
  // P1-23: nonce también viaja en cookie porque el Map no sobrevive entre
  // instancias de Vercel; el callback lo valida contra el ID token.
  const destino = buildAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    nonce,
    codeChallenge: challenge,
    prompt,
  });
  const setCookies = [
    cookieHost("__Host-oauth-state", state),
    cookieHost("__Host-oauth-pkce", verifier),
    cookieHost("__Host-oauth-nonce", nonce),
    cookieHost("__Host-oauth-destino", destino),
  ];
  if (invitationToken) setCookies.push(cookieHost("__Host-oauth-invite", invitationToken));
  if (next) setCookies.push(cookieHost("__Host-oauth-next", next));
  return respuestaHaciaHop(setCookies, destino);
};
