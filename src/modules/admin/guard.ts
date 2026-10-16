import { leerVarEntorno } from "../../lib/env.js";

// LANE admin — Guard PA1 (allowlist + reauth para mutantes).
//
// Núcleo: la allowlist única es ADMIN_ALLOWLIST_SUBS; SUPERADMIN_SUBS queda
// como fallback deprecado (se une, nunca se loguea) para no dejar sin acceso
// a un deploy que solo la tenga. Decide por google_sub, nunca por email
// (PA1). Reauth: los POST mutantes exigen lastReauthEn dentro de la ventana
// (PA1.8: 5min).

export const VENTANA_REAUTH_MIN = 5;

let avisoSuperadminEmitido = false;

function parsearLista(crudo: string): string[] {
  return crudo
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function esAdminAllowlist(googleSub: string, allowlist: readonly string[]): boolean {
  if (!googleSub) return false;
  return allowlist.includes(googleSub);
}

export function leerAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const admin = parsearLista(leerVarEntorno("ADMIN_ALLOWLIST_SUBS", env));
  const legacy = parsearLista(leerVarEntorno("SUPERADMIN_SUBS", env));
  if (legacy.length > 0 && !avisoSuperadminEmitido) {
    avisoSuperadminEmitido = true;
    console.warn("SUPERADMIN_SUBS está deprecada; mové los subs a ADMIN_ALLOWLIST_SUBS");
  }
  return [...new Set([...admin, ...legacy])];
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
