import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Sesiones P0, puro sin IO (AU8). El adaptador (ruta/middleware) lee y escribe
// `sessions` en control; acá solo se decide sobre registros ya cargados.
export const COOKIE_SESION = "__Host-sesion";
export const INACTIVIDAD_MS = 30 * 24 * 3600 * 1000;
export const MAXIMO_ABSOLUTO_MS = 90 * 24 * 3600 * 1000;
// Por qué 1 escritura/hora como constante: evita un UPDATE por request (AU8.4)
// sin dejar la ventana de revocación más larga que unos segundos, porque la
// revocación invalida explícitamente y no depende de last_seen_at.
export const THROTTLE_ESCRITURA_MS = 3600 * 1000;

export interface RegistroSesion {
  idHash: string;
  googleSub: string;
  tenantId: string | null;
  expiraAt: string;
  expiraAbsoluta?: string | undefined;
  creadoAt: string;
  lastSeenAt?: string | undefined;
  revocadaAt?: string | undefined;
}

export function sha256Hex(valor: string): string {
  return createHash("sha256").update(valor, "utf8").digest("hex");
}

export function compararHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function crearSesion(input: {
  googleSub: string;
  tenantId: string | null;
  ahora?: Date | undefined;
  inactividadMs?: number | undefined;
  maximoMs?: number | undefined;
}): { idPlano: string; registro: RegistroSesion } {
  const ahora = input.ahora ?? new Date();
  const inactividad = input.inactividadMs ?? INACTIVIDAD_MS;
  const maximo = input.maximoMs ?? MAXIMO_ABSOLUTO_MS;
  // Por qué 256 bits aleatorios: el id plano es el secreto; en la base solo
  // queda el hash, así una copia de `sessions` no arma una cookie válida.
  const idPlano = randomBytes(32).toString("hex");
  const expira = new Date(ahora.getTime() + inactividad);
  const absoluta = new Date(ahora.getTime() + maximo);
  return {
    idPlano,
    registro: {
      idHash: sha256Hex(idPlano),
      googleSub: input.googleSub,
      tenantId: input.tenantId,
      expiraAt: expira.toISOString(),
      expiraAbsoluta: absoluta.toISOString(),
      creadoAt: ahora.toISOString(),
      lastSeenAt: ahora.toISOString(),
    },
  };
}

export type MotivoSesion =
  | "valida"
  | "hash_distinto"
  | "revocada"
  | "vencida_inactividad"
  | "vencida_absoluta";

export interface ValidezSesion {
  valida: boolean;
  motivo: MotivoSesion;
  // Rolling con throttle: solo reescribir si pasó >= 1h desde last_seen_at.
  necesitaReescritura: boolean;
  expiraAtNueva?: string | undefined;
}

export function validarSesion(input: {
  idPlano: string;
  registro: RegistroSesion | undefined;
  ahora?: Date | undefined;
}): ValidezSesion {
  const ahora = input.ahora ?? new Date();
  const r = input.registro;
  if (!r) return { valida: false, motivo: "hash_distinto", necesitaReescritura: false };
  if (!compararHash(sha256Hex(input.idPlano), r.idHash)) {
    return { valida: false, motivo: "hash_distinto", necesitaReescritura: false };
  }
  if (r.revocadaAt) return { valida: false, motivo: "revocada", necesitaReescritura: false };
  if (new Date(r.expiraAt).getTime() <= ahora.getTime()) {
    return { valida: false, motivo: "vencida_inactividad", necesitaReescritura: false };
  }
  if (r.expiraAbsoluta && new Date(r.expiraAbsoluta).getTime() <= ahora.getTime()) {
    return { valida: false, motivo: "vencida_absoluta", necesitaReescritura: false };
  }
  const visto = r.lastSeenAt ? new Date(r.lastSeenAt).getTime() : 0;
  const necesita = ahora.getTime() - visto >= THROTTLE_ESCRITURA_MS;
  if (!necesita) return { valida: true, motivo: "valida", necesitaReescritura: false };
  const topeAbsoluto = r.expiraAbsoluta ? new Date(r.expiraAbsoluta).getTime() : Infinity;
  const nueva = Math.min(ahora.getTime() + INACTIVIDAD_MS, topeAbsoluto);
  return {
    valida: true,
    motivo: "valida",
    necesitaReescritura: true,
    expiraAtNueva: new Date(nueva).toISOString(),
  };
}

// Por qué rotar en login/reautenticación/cambio de rol: un id robado antes del
// cambio deja de servir (AU8.5); la sesión vieja se revoca en el adaptador.
export function rotarSesion(input: {
  registro: RegistroSesion;
  ahora?: Date | undefined;
}): { idPlano: string; registro: RegistroSesion } {
  const creada = crearSesion({
    googleSub: input.registro.googleSub,
    tenantId: input.registro.tenantId,
    ahora: input.ahora,
    inactividadMs: INACTIVIDAD_MS,
    maximoMs: Math.max(
      1,
      (input.registro.expiraAbsoluta
        ? new Date(input.registro.expiraAbsoluta).getTime()
        : Date.now() + MAXIMO_ABSOLUTO_MS) - (input.ahora ?? new Date()).getTime(),
    ),
  });
  return creada;
}

export function cookieSesion(idPlano: string, expiraAt: string, ahora?: Date): string {
  const hoy = (ahora ?? new Date()).getTime();
  const maxAge = Math.max(1, Math.floor((new Date(expiraAt).getTime() - hoy) / 1000));
  return `${COOKIE_SESION}=${idPlano}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function cookieBorrarSesion(): string {
  return `${COOKIE_SESION}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function extraerSesionDeCookie(header: string | null): string | null {
  if (!header) return null;
  for (const parte of header.split(";")) {
    const [k, ...resto] = parte.trim().split("=");
    if (k === COOKIE_SESION) {
      const v = resto.join("=").trim();
      return v ? v : null;
    }
  }
  return null;
}
