import { control, type ControlSession } from "./store.js";
import {
  validarSesion,
  extraerSesionDeCookie,
  sha256Hex,
} from "../modules/auth/sesiones.js";
import { necesitaReauth } from "../modules/auth/reautenticacion.js";
import { leerVarEntorno } from "./env.js";

// Adaptador control en memoria (ver store.ts): resuelve sesión + membership por
// request. En producción lee Drizzle; la forma de la decisión es la misma.
export interface ContextoAuth {
  sesion: ControlSession;
  googleSub: string;
  tenantId: string | null;
}

export function resolverSesionPorPlano(idPlano: string, ahora = new Date()): ContextoAuth | null {
  const s = control.sessions.get(sha256Hex(idPlano));
  if (!s) return null;
  const v = validarSesion({
    idPlano,
    ahora,
    registro: {
      idHash: s.idHash,
      googleSub: s.googleSub,
      tenantId: s.tenantId,
      expiraAt: s.expiraAt,
      expiraAbsoluta: s.expiraAbsoluta,
      creadoAt: s.lastSeenAt ?? s.expiraAt,
      lastSeenAt: s.lastSeenAt,
      revocadaAt: s.revocadaAt,
    },
  });
  // Sesión con hash alterado, revocada o vencida rechaza el siguiente request.
  if (!v.valida) return null;
  if (v.necesitaReescritura && v.expiraAtNueva) {
    s.expiraAt = v.expiraAtNueva;
    s.lastSeenAt = ahora.toISOString();
  }
  return { sesion: s, googleSub: s.googleSub, tenantId: s.tenantId };
}

export function resolverSesion(request: Request, ahora = new Date()): ContextoAuth | null {
  const idPlano = extraerSesionDeCookie(request.headers.get("cookie"));
  if (!idPlano) return null;
  return resolverSesionPorPlano(idPlano, ahora);
}

export function esSuperadmin(googleSub: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const allow = leerVarEntorno("SUPERADMIN_SUBS", env)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(googleSub);
}

export function membershipActiva(tenantId: string, googleSub: string) {
  for (const m of control.memberships.values()) {
    if (m.tenantId === tenantId && m.googleSub === googleSub && m.estado === "activo") return m;
  }
  return null;
}

export function esDueno(tenantId: string, googleSub: string): boolean {
  const m = membershipActiva(tenantId, googleSub);
  return m?.rol === "dueno";
}

export function contarMiembrosActivos(tenantId: string): number {
  let n = 0;
  for (const m of control.memberships.values()) {
    if (m.tenantId === tenantId && m.estado === "activo") n += 1;
  }
  return n;
}

export function jsonError(mensaje: string, status: number): Response {
  return Response.json({ error: mensaje }, { status });
}

// AU10: exige reauth reciente para acciones sensibles del Dueño. Si falta,
// responde 401 con la URL de inicio para que la web retome la acción.
// El login deja reauthAt fresco, así el flujo normal no la pide de más.
export function exigirReauthReciente(ctx: ContextoAuth, ahora = new Date()): Response | null {
  if (necesitaReauth({ reauthAt: ctx.sesion.reauthAt, ahora })) {
    return Response.json(
      {
        error: "Por seguridad, confirmá que sos vos.",
        codigo: "reauth_requerida",
        reauth_url: "/api/auth/reauth",
      },
      { status: 401 },
    );
  }
  return null;
}
