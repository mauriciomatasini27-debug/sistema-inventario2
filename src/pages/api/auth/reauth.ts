import type { APIRoute } from "astro";
import {
  buildAuthorizationUrl,
  generarPKCE,
  leerConfigLogin,
  nuevoNonce,
  nuevoState,
} from "../../../modules/auth/oidc.js";
import { control } from "../../../lib/store.js";
import { jsonError, resolverSesion } from "../../../lib/control.js";

export const prerender = false;

// que confirme con la misma cuenta. El callback rota la sesión y retoma.
export const GET: APIRoute = async ({ request, redirect }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  let config;
  try {
    config = leerConfigLogin();
  } catch {
    return jsonError("Falta configurar GOOGLE_LOGIN_CLIENT_ID/SECRET/REDIRECT", 500);
  }
  const url = new URL(request.url);
  const continuar = url.searchParams.get("continuar") ?? undefined;
  const user = control.users.get(ctx.googleSub);
  const { verifier, challenge } = generarPKCE();
  const state = nuevoState();
  const nonce = nuevoNonce();
  control.pendingReauth.set(state, {
    googleSub: ctx.googleSub,
    nonce,
    verifier,
    expiraEnMs: Date.now() + 10 * 60_000,
    continuar: continuar?.startsWith("/") ? continuar : undefined,
  });
  // Por qué login_hint + select_account: evita confirmar con otra cuenta por
  // error; si elige otra, la acción se cancela (AU10, criterio 3).
  // redirectUri reutiliza el de login con discriminator por state: el
  // callback de reauth valida contra pendingReauth, no pendingAuth.
  const destino = buildAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    nonce,
    codeChallenge: challenge,
    prompt: "select_account",
    loginHint: user?.email,
  });
  const r = redirect(destino, 302);
  r.headers.append("Set-Cookie", `__Host-reauth-state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  r.headers.append("Set-Cookie", `__Host-reauth-pkce=${verifier}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  return r;
};
