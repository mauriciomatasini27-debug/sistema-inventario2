import type { APIRoute } from "astro";
import {
  intercambiarCodigo,
  leerConfigLogin,
  normalizarEmail,
  verificarIdToken,
} from "../../../modules/auth/oidc.js";
import { crearSesion } from "../../../modules/auth/sesiones.js";
import { decidirAceptacion, hashToken } from "../../../modules/tenants/invitaciones.js";
import { PERMISOS_EMPLEADO_DEFAULT } from "../../../modules/auth/modelo.js";
import { control } from "../../../lib/store.js";
import { notificarAlertaSeguridad } from "../../../lib/alertas-seguridad.js";

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
  const pendiente = state ? control.pendingAuth.get(state) : undefined;
  if (!code || !state || !pendiente || stateCookie !== state || !verifier) {
    if (state) control.pendingAuth.delete(state);
    return Response.json({ error: "Sesión de ingreso inválida o vencida. Volvé a intentarlo." }, { status: 403 });
  }
  if (pendiente.expiraEnMs < Date.now()) {
    control.pendingAuth.delete(state);
    return Response.json({ error: "Sesión de ingreso vencida. Volvé a intentarlo." }, { status: 403 });
  }
  control.pendingAuth.delete(state);

  let config;
  try {
    config = leerConfigLogin();
  } catch {
    return Response.json({ error: "Falta configurar GOOGLE_LOGIN_CLIENT_ID/SECRET/REDIRECT" }, { status: 500 });
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
    return Response.json({ error: "No se pudo validar tu cuenta de Google. Volvé a intentarlo." }, { status: 403 });
  }

  const email = normalizarEmail(identidad.email);
  const ahora = new Date();
  const previo = control.users.get(identidad.sub);
  control.users.set(identidad.sub, {
    googleSub: identidad.sub,
    email,
    emailVerificado: true,
    nombre: identidad.nombre ?? previo?.nombre,
    fotoUrl: identidad.fotoUrl ?? previo?.fotoUrl,
    ultimoLoginAt: ahora.toISOString(),
  });
  if (previo && previo.email !== email) {
    control.events.push({
      tenantId: null,
      tipo: "email_cambiado",
      actor: identidad.sub,
      detalle: { anterior: previo.email },
    });
  }

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
  control.events.push({ tenantId, tipo: "login", actor: identidad.sub });
  if (agente && agentesPrevios.size > 0 && !agentesPrevios.has(agente)) {
    void notificarAlertaSeguridad({ evento: "login_nuevo", tenantId, googleSubDestino: identidad.sub, detalle: agente });
  }
  cookies.set("__Host-sesion", creada.idPlano, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  const next = (pendiente as { next?: string }).next;
  const destino = next && ["/panel", "/admin", "/"].includes(next) ? next : tenantId ? "/" : "/?alta=pendiente";
  return redirect(destino, 302);
}
