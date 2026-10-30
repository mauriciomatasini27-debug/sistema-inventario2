import type { APIRoute } from "astro";
import {
  intercambiarCodigo,
  leerConfigLogin,
  normalizarEmail,
  verificarIdToken,
} from "../../../modules/auth/oidc.js";
import { crearSesion } from "../../../modules/auth/sesiones.js";
import { esAdminAllowlist, leerAllowlist } from "../../../modules/admin/guard.js";
import { decidirAceptacion, hashToken } from "../../../modules/tenants/invitaciones.js";
import { PERMISOS_EMPLEADO_DEFAULT } from "../../../modules/auth/modelo.js";
import { control } from "../../../lib/store.js";
import { persistirSesion, persistirUsuario } from "../../../lib/control-db.js";
import { rehidratarMembresias } from "../../../lib/rehidratar-membresia.js";
import { notificarAlertaSeguridad } from "../../../lib/alertas-seguridad.js";

export const prerender = false;

const COOKIES_OAUTH = [
  "__Host-oauth-state",
  "__Host-oauth-pkce",
  "__Host-oauth-nonce",
  "__Host-oauth-invite",
  "__Host-oauth-next",
] as const;

function leerCookie(header: string | null, nombre: string): string | null {
  if (!header) return null;
  for (const parte of header.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() !== nombre) continue;
    const crudo = parte.slice(i + 1).trim();
    if (!crudo) return null;
    try {
      return decodeURIComponent(crudo);
    } catch {
      return crudo;
    }
  }
  return null;
}

function borrarCookiesOauth(headers: Headers): void {
  for (const n of COOKIES_OAUTH) {
    headers.append("Set-Cookie", `${n}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  }
}

function jsonOauth(error: string, status: number): Response {
  const r = Response.json({ error }, { status });
  borrarCookiesOauth(r.headers);
  return r;
}

function falloIngreso(
  request: Request,
  redirect: (path: string, status?: 302) => Response,
  error: string,
  status = 403,
): Response {
  // P1-24: el navegador (Accept: text/html) vuelve a la landing en vez de JSON crudo.
  const acepta = request.headers.get("accept") ?? "";
  if (acepta.includes("text/html")) {
    const r = redirect(`/?ingreso=error&mensaje=${encodeURIComponent(error)}`, 302);
    borrarCookiesOauth(r.headers);
    return r;
  }
  return jsonOauth(error, status);
}

// GET /api/auth/callback — valida el código, upsertea el usuario, resuelve
// invitación pendiente o deja la sesión lista para el alta, y setea la cookie.
export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("error") === "access_denied") {
    return redirect("/?ingreso=cancelado&mensaje=Cancelaste%20el%20ingreso%20con%20Google", 302);
  }
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const header = request.headers.get("cookie");
  const stateCookie = leerCookie(header, "__Host-oauth-state");
  const verifier = leerCookie(header, "__Host-oauth-pkce");
  const nonceCookie = leerCookie(header, "__Host-oauth-nonce");
  const inviteCookie = leerCookie(header, "__Host-oauth-invite") ?? undefined;
  const nextCookieRaw = leerCookie(header, "__Host-oauth-next");
  const nextCookie =
    nextCookieRaw && ["/panel", "/admin", "/"].includes(nextCookieRaw) ? nextCookieRaw : undefined;
  const enMapa = state ? control.pendingAuth.get(state) : undefined;
  // P1-23: cookies son la fuente durable (Vercel multi-instancia). El Map
  // sigue como caché monoproceso; si no está, armamos el pendiente desde cookies.
  const pendiente = enMapa
    ? enMapa
    : nonceCookie && verifier
      ? {
          nonce: nonceCookie,
          verifier,
          expiraEnMs: Date.now() + 10 * 60_000,
          ...(inviteCookie ? { invitationToken: inviteCookie } : {}),
          ...(nextCookie ? { next: nextCookie } : {}),
        }
      : undefined;
  if (!code || !state || !pendiente || stateCookie !== state || !verifier || !pendiente.nonce) {
    if (state) control.pendingAuth.delete(state);
    return falloIngreso(request, redirect, "Sesión de ingreso inválida o vencida. Volvé a intentarlo.");
  }
  if (enMapa && pendiente.expiraEnMs < Date.now()) {
    control.pendingAuth.delete(state);
    return falloIngreso(request, redirect, "Sesión de ingreso vencida. Volvé a intentarlo.");
  }
  control.pendingAuth.delete(state);

  let config;
  try {
    config = leerConfigLogin();
  } catch {
    return falloIngreso(request, redirect, "Falta configurar GOOGLE_LOGIN_CLIENT_ID/SECRET/REDIRECT", 500);
  }

  let identidad;
  try {
    const { idToken } = await intercambiarCodigo({ code, codeVerifier: verifier, config });
    identidad = await verificarIdToken({
      idToken,
      expectedAud: config.clientId,
      nonceEsperado: pendiente.nonce,
    });
  } catch {
    return falloIngreso(request, redirect, "No se pudo validar tu cuenta de Google. Volvé a intentarlo.");
  }

  const email = normalizarEmail(identidad.email);
  const ahora = new Date();
  const previo = control.users.get(identidad.sub);
  const usuario = {
    googleSub: identidad.sub,
    email,
    emailVerificado: true,
    nombre: identidad.nombre ?? previo?.nombre,
    fotoUrl: identidad.fotoUrl ?? previo?.fotoUrl,
    ultimoLoginAt: ahora.toISOString(),
  };
  control.users.set(identidad.sub, usuario);
  // Copia durable antes de seguir: tenants.owner_google_sub referencia
  // users(google_sub), así que sin esta fila el alta de comercio falla la FK
  // y queda solo en memoria. Se espera para que el alta no corra en carrera.
  await persistirUsuario(usuario);
  if (previo && previo.email !== email) {
    control.events.push({
      tenantId: null,
      tipo: "email_cambiado",
      actor: identidad.sub,
      detalle: { anterior: previo.email },
    });
  }

  // El reinicio vacía la memoria. Sin esta carga la sesión nace sin comercio
  // y el panel responde 403 aunque la membership siga en la base.
  await rehidratarMembresias(identidad.sub);

  // Resolución: invitación por token del login, o pendiente para este email, o
  // membership existente; si no hay nada, sesión sin tenant para el alta.
  let tenantId: string | null = null;
  const tokenInvitacion = pendiente.invitationToken;
  // El token viaja plano en el link; se hashea para comparar (AU6.2).
  const hashBuscado = tokenInvitacion ? hashToken(tokenInvitacion) : null;
  const candidatas = [...control.invitations.values()].filter((c) => {
    if (hashBuscado) return c.tokenHash === hashBuscado;
    return c.estado === "pendiente" && normalizarEmail(c.email) === email;
  });
  for (const inv of candidatas) {
    const tenant = control.tenants.get(inv.tenantId);
    if (!tenant) continue;
    const miembros = [...control.memberships.values()].filter(
      (m) => m.tenantId === inv.tenantId && m.estado === "activo",
    ).length;
    const yaEs = [...control.memberships.values()].some(
      (m) => m.tenantId === inv.tenantId && m.googleSub === identidad.sub && m.estado === "activo",
    );
    const d = decidirAceptacion({
      invitacion: {
        tokenHash: inv.tokenHash,
        tenantId: inv.tenantId,
        email: inv.email,
        rol: inv.rol,
        permisos: inv.permisos,
        estado: inv.estado,
        expiraAt: inv.expiraAt,
      },
      emailSesion: email,
      emailVerificado: true,
      ahora,
      miembrosActivos: miembros,
      plan: tenant.plan,
      yaEsMiembro: yaEs,
    });
    if (!d.acepta) continue;
    inv.estado = "aceptada";
    inv.aceptadaPor = identidad.sub;
    const id = crypto.randomUUID();
    control.memberships.set(id, {
      id,
      tenantId: inv.tenantId,
      googleSub: identidad.sub,
      rol: inv.rol,
      permisos: inv.permisos.length > 0 ? inv.permisos : [...PERMISOS_EMPLEADO_DEFAULT],
      estado: "activo",
    });
    control.events.push({ tenantId: inv.tenantId, tipo: "invitacion_aceptada", actor: identidad.sub });
    tenantId = inv.tenantId;
    break;
  }
  if (!tenantId) {
    for (const m of control.memberships.values()) {
      if (m.googleSub === identidad.sub && m.estado === "activo") {
        tenantId = m.tenantId;
        break;
      }
    }
  }

  const creada = crearSesion({ googleSub: identidad.sub, tenantId, ahora });
  const agente = request.headers.get("user-agent")?.slice(0, 80) ?? undefined;
  const agentesPrevios = new Set(
    [...control.sessions.values()].filter((s) => s.googleSub === identidad.sub && s.agente).map((s) => s.agente as string),
  );
  control.sessions.set(creada.registro.idHash, {
    idHash: creada.registro.idHash,
    googleSub: identidad.sub,
    tenantId,
    expiraAt: creada.registro.expiraAt,
    expiraAbsoluta: creada.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    agente,
    // AU9.1: dispositivo visible en "Mis sesiones". AU10.2: el login con
    // Google cuenta como reauth fresca.
    reauthAt: ahora.toISOString(),
  });
  // P1-25: await — si redirigimos antes de que la fila exista, la otra
  // instancia de Vercel no rehidrata y el 1er login parece fallar (landing).
  await persistirSesion({
    idHash: creada.registro.idHash,
    googleSub: identidad.sub,
    tenantId,
    expiraAt: creada.registro.expiraAt,
    expiraAbsoluta: creada.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  control.events.push({ tenantId, tipo: "login", actor: identidad.sub });
  if (agente && agentesPrevios.size > 0 && !agentesPrevios.has(agente)) {
    void notificarAlertaSeguridad({ evento: "login_nuevo", tenantId, googleSubDestino: identidad.sub, detalle: agente });
  }
  const maxAgeSesion = 30 * 24 * 3600;
  cookies.set("__Host-sesion", creada.idPlano, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSesion,
  });
  const next = pendiente.next;
  // AU2-S3: next validado gana; sin next, la allowlist admin termina en
  // /admin; el defecto para el resto queda intacto. El corte de permisos lo
  // hace exigirAdmin en cada API, no este redirect.
  const nextOk = next && ["/panel", "/admin", "/"].includes(next) ? next : undefined;
  const destino = nextOk ?? (esAdminAllowlist(identidad.sub, leerAllowlist()) ? "/admin" : tenantId ? "/" : "/?alta=pendiente");
  const r = redirect(destino, 302);
  borrarCookiesOauth(r.headers);
  // P1-25: Set-Cookie en el Response del redirect (no solo cookies.set):
  // en Vercel el jar de Astro a veces no viaja con el 302 mutado a mano.
  r.headers.append(
    "Set-Cookie",
    `__Host-sesion=${encodeURIComponent(creada.idPlano)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSesion}`,
  );
  return r;
}
