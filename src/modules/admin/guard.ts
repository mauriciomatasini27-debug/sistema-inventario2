import { leerVarEntorno } from "../../lib/env.js";

// LANE admin — Guard PA1 (allowlist de un solo sub + reauth para mutantes).
//
// Núcleo: el panel es de un solo operador. ADMIN_ALLOWLIST_SUBS tiene que
// traer exactamente un google_sub; vacía o con más de uno niega todo
// (fail-closed) y lo avisa una vez en el log, sin loguear subs. Decide por
// google_sub, nunca por email (PA1). SUPERADMIN_SUBS ya no se lee.

export const VENTANA_REAUTH_MIN = 5;

let avisoAllowlistEmitido = false;

function parsearLista(crudo: string): string[] {
  return [
    ...new Set(
      crudo
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

export function esAdminAllowlist(googleSub: string, allowlist: readonly string[]): boolean {
  if (!googleSub) return false;
  return allowlist.includes(googleSub);
}

export function leerAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const subs = parsearLista(leerVarEntorno("ADMIN_ALLOWLIST_SUBS", env));
  if (subs.length === 1) return subs;
  if (!avisoAllowlistEmitido) {
    avisoAllowlistEmitido = true;
    console.error(
      `ADMIN_ALLOWLIST_SUBS tiene ${subs.length} subs; tiene que tener exactamente 1. Panel admin cerrado para todos.`,
    );
  }
  return [];
}

export type ReauthDecision = { readonly ok: true } | { readonly ok: false; readonly error: string };

// Por qué step-up y no solo sesión: suspender, asentar y flags mueven plata
// o acceso; PA1 exige reauth reciente para esas acciones.
export function exigeReauth(args: {
  readonly lastReauthEn: string | null;
  readonly ahora?: Date;
  readonly ventanaMin?: number;
}): ReauthDecision {
  const ventana = args.ventanaMin ?? VENTANA_REAUTH_MIN;
  if (!args.lastReauthEn) {
    return { ok: false, error: "Reautenticá tu sesión para continuar." };
  }
  const haceMin = ((args.ahora ?? new Date()).getTime() - new Date(args.lastReauthEn).getTime()) / 60_000;
  if (Number.isNaN(haceMin) || haceMin < 0 || haceMin > ventana) {
    return { ok: false, error: "Reautenticá tu sesión para continuar." };
  }
  return { ok: true };
}
