// LANE admin — Guard PA1 (allowlist + reauth para mutantes).
//
// Núcleo puro: sin IO. La allowlist es ADMIN_ALLOWLIST_SUBS (env propia, no
// reutilizar SUPERADMIN_SUBS para poder rotar por separado). Decide por
// google_sub, nunca por email (PA1). Reauth: los POST mutantes exigen
// lastReauthEn dentro de la ventana (PA1.8: 5min).

export const VENTANA_REAUTH_MIN = 5;

export function esAdminAllowlist(googleSub: string, allowlist: readonly string[]): boolean {
  if (!googleSub) return false;
  return allowlist.includes(googleSub);
}

export function leerAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const crudo = env["ADMIN_ALLOWLIST_SUBS"] ?? "";
  return crudo
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
