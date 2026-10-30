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

// GET /api/auth/login — redirige a Google con PKCE S256 + nonce + state.
// El verifier/nonce viajan en cookies HttpOnly de un solo uso, nunca en el
// ID token; el intercambio del código lo hace el callback en el servidor.
export const GET: APIRoute = async ({ request, redirect }) => {
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
  // P1-23: nonce/invite/next también en cookies. En Vercel login y callback
  // suelen caer en instancias distintas y el Map `pendingAuth` no viaja.
  const r = redirect(destino, 302);
  const base = "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600";
  r.headers.append("Set-Cookie", `__Host-oauth-state=${state}; ${base}`);
  r.headers.append("Set-Cookie", `__Host-oauth-pkce=${verifier}; ${base}`);
  r.headers.append("Set-Cookie", `__Host-oauth-nonce=${nonce}; ${base}`);
  if (invitationToken) r.headers.append("Set-Cookie", `__Host-oauth-invite=${invitationToken}; ${base}`);
  if (next) r.headers.append("Set-Cookie", `__Host-oauth-next=${next}; ${base}`);
  return r;
};
