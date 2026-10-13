// Reautenticación para acciones sensibles P0 (AU10.1-AU10.2, AU10.5).
// Núcleo puro: sin IO. El adaptador (ruta) carga la sesión, exige ventana,
// lanza OIDC con prompt=select_account y rota el ID al completar.

export const VENTANA_REAUTH_MS = 10 * 60 * 1000;
export const IAT_MAX_MS = 2 * 60 * 1000;
export const MAX_FALLOS_REAUTH = 5;
export const BLOQUEO_REAUTH_MS = 5 * 60 * 1000;

// Acciones sensibles exclusivas del Dueño que exigen reauth reciente (AU10.1).
// Solo las que existen en el servidor hoy; datos de cobro/Gmail/Photos y
// suscripción se agregan cuando existan sus rutas.
export const ACCIONES_SENSIBLES = [
  "invitar_miembro",
  "cambiar_permisos",
  "revocar_acceso",
  "cancelar_invitacion",
  "cerrar_sesiones_otro",
  "nombrar_dispositivo",
  "exportar_datos",
] as const;
export type AccionSensible = (typeof ACCIONES_SENSIBLES)[number];

export function necesitaReauth(input: {
  reauthAt?: string | undefined;
  ahora?: Date | undefined;
  ventanaMs?: number | undefined;
}): boolean {
  const ahora = input.ahora ?? new Date();
  if (!input.reauthAt) return true;
  const t = new Date(input.reauthAt).getTime();
  if (Number.isNaN(t)) return true;
  return ahora.getTime() - t >= (input.ventanaMs ?? VENTANA_REAUTH_MS);
}

export type MotivoReauth = "ok" | "sub_distinto" | "token_viejo" | "nonce_distinto";

export function validarReauth(input: {
  subSesion: string;
  subToken: string;
  nonceEsperado?: string | undefined;
  nonceToken?: unknown;
  iatMs?: number | undefined;
  ahoraMs?: number | undefined;
}): { ok: boolean; motivo: MotivoReauth } {
  if (input.subSesion !== input.subToken) return { ok: false, motivo: "sub_distinto" };
  if (input.nonceEsperado !== undefined && input.nonceToken !== input.nonceEsperado) {
    return { ok: false, motivo: "nonce_distinto" };
  }
  if (input.iatMs !== undefined) {
    const ahora = input.ahoraMs ?? Date.now();
    if (Number.isNaN(input.iatMs) || ahora - input.iatMs > IAT_MAX_MS || input.iatMs > ahora + 60_000) {
      return { ok: false, motivo: "token_viejo" };
    }
  }
  return { ok: true, motivo: "ok" };
}

export interface EstadoFallos {
  fallos: number;
  bloqueadoHastaMs: number;
}

export function estaBloqueadoReauth(estado: EstadoFallos | undefined, ahoraMs: number): boolean {
  return !!estado && estado.bloqueadoHastaMs > ahoraMs;
}

export function registrarFalloReauth(
  previo: EstadoFallos | undefined,
  ahoraMs: number,
): EstadoFallos {
  const fallos = (previo?.fallos ?? 0) + 1;
  if (fallos >= MAX_FALLOS_REAUTH) {
    return { fallos, bloqueadoHastaMs: ahoraMs + BLOQUEO_REAUTH_MS };
  }
  return { fallos, bloqueadoHastaMs: previo?.bloqueadoHastaMs ?? 0 };
}
