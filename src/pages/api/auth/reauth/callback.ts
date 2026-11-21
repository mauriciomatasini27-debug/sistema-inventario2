import type { APIRoute } from "astro";
import {
  intercambiarCodigo,
  leerConfigLogin,
  verificarIdToken,
} from "../../../../modules/auth/oidc.js";
import { crearSesion, extraerSesionDeCookie, sha256Hex } from "../../../../modules/auth/sesiones.js";
import {
  estaBloqueadoReauth,
  registrarFalloReauth,
  validarReauth,
} from "../../../../modules/auth/reautenticacion.js";
import { control } from "../../../../lib/store.js";
import { persistirAuthEvent, persistirSesion, revocarSesionDb } from "../../../../lib/control-db.js";
import { notificarAlertaSeguridad } from "../../../../lib/alertas-seguridad.js";

export const prerender = false;

function leerCookie(header: string | null, nombre: string): string | null {
  if (!header) return null;
  for (const parte of header.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim() || null;
  }
  return null;
}

// token como en el login, exige mismo sub + iat<2min + nonce, actualiza
// reauth_at y rota el ID de sesión. Luego redirige a `continuar`.
export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("error") === "access_denied") {
    return redirect("/?reauth=cancelada&mensaje=Cancelaste%20la%20confirmaci%C3%B3n", 302);
  }
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const header = request.headers.get("cookie");
  const stateCookie = leerCookie(header, "__Host-reauth-state");
  const verifier = leerCookie(header, "__Host-reauth-pkce");
  const pendiente = state ? control.pendingReauth.get(state) : undefined;
  if (!code || !state || !pendiente || stateCookie !== state || !verifier) {
    return Response.json({ error: "Confirmación inválida o vencida. Volvé a intentarlo." }, { status: 403 });
  }
  if (pendiente.expiraEnMs < Date.now()) {
    control.pendingReauth.delete(state);
    return Response.json({ error: "Confirmación vencida. Volvé a intentarlo." }, { status: 403 });
  }
  if (estaBloqueadoReauth(control.reauthFallos.get(pendiente.googleSub), Date.now())) {
    return Response.json({ error: "Demasiados intentos. Esperá unos minutos." }, { status: 429 });
  }
  control.pendingReauth.delete(state);

  let config;
  try {
    config = leerConfigLogin();
  } catch {
    return Response.json({ error: "Falta configurar GOOGLE_LOGIN_CLIENT_ID/SECRET/REDIRECT" }, { status: 500 });
  }

  const fallar = (motivo: string, status: number) => {
    control.reauthFallos.set(pendiente.googleSub, registrarFalloReauth(control.reauthFallos.get(pendiente.googleSub), Date.now()));
    control.events.push({ tenantId: null, tipo: "reauth_fallida", actor: pendiente.googleSub, detalle: { motivo }, creadoEn: new Date().toISOString() });
    void persistirAuthEvent({ tenantId: null, tipo: "reauth_fallida", actor: pendiente.googleSub, detalle: { motivo } });
    void notificarAlertaSeguridad({ evento: "reauth_fallida", tenantId: null, googleSubDestino: pendiente.googleSub });
    return Response.json({ error: motivo }, { status });
  };

  let identidad;
  try {
    const { idToken } = await intercambiarCodigo({ code, codeVerifier: verifier, config });
    identidad = await verificarIdToken({ idToken, expectedAud: config.clientId, nonceEsperado: pendiente.nonce });
  } catch {
    return fallar("No se pudo validar tu cuenta de Google. Volvé a intentarlo.", 403);
  }

  const v = validarReauth({
    subSesion: pendiente.googleSub,
    subToken: identidad.sub,
    nonceEsperado: pendiente.nonce,
    nonceToken: identidad.nonce,
    iatMs: identidad.iatMs,
    ahoraMs: Date.now(),
  });
  if (!v.ok) {
    if (v.motivo === "sub_distinto") {
      return fallar("Tenés que confirmar con la misma cuenta con la que entraste.", 403);
    }
    return fallar("Confirmación vencida. Volvé a intentarlo.", 403);
  }
  control.reauthFallos.delete(pendiente.googleSub);

  const idPlanoViejo = extraerSesionDeCookie(header);
  const ahora = new Date();
  const vieja = idPlanoViejo ? control.sessions.get(sha256Hex(idPlanoViejo)) : undefined;
  if (vieja && !vieja.revocadaAt) {
    vieja.revocadaAt = ahora.toISOString();
    vieja.motivo = "rotacion_reauth";
    void revocarSesionDb(vieja.idHash, "rotacion_reauth");
  }
  const creada = crearSesion({ googleSub: pendiente.googleSub, tenantId: vieja?.tenantId ?? null, ahora });
  control.sessions.set(creada.registro.idHash, {
    idHash: creada.registro.idHash,
    googleSub: pendiente.googleSub,
    tenantId: vieja?.tenantId ?? null,
    expiraAt: creada.registro.expiraAt,
    expiraAbsoluta: creada.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    agente: vieja?.agente,
    dispositivoCodigo: vieja?.dispositivoCodigo,
    reauthAt: ahora.toISOString(),
  });
  void persistirSesion({
    idHash: creada.registro.idHash,
    googleSub: pendiente.googleSub,
    tenantId: vieja?.tenantId ?? null,
    expiraAt: creada.registro.expiraAt,
    expiraAbsoluta: creada.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  control.events.push({ tenantId: vieja?.tenantId ?? null, tipo: "reauth_ok", actor: pendiente.googleSub, creadoEn: ahora.toISOString() });
  void persistirAuthEvent({ tenantId: vieja?.tenantId ?? null, tipo: "reauth_ok", actor: pendiente.googleSub });
  cookies.set("__Host-sesion", creada.idPlano, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return redirect(pendiente.continuar ?? "/", 302);
};
