// TB-164: límites por usuario y comercio (solo servidor).

const MAX_POR_HORA = 5;
const MAX_POR_DIA = 20;
const VENTANA_HORA_MS = 60 * 60 * 1000;
const VENTANA_DIA_MS = 24 * 60 * 60 * 1000;

const envios = new Map<string, number[]>();

export function resetRateLimitReportes(): void {
  envios.clear();
}

function clave(tenantId: string, googleSub: string): string {
  return `${tenantId}:${googleSub}`;
}

export function evaluarRateLimit(tenantId: string, googleSub: string, ahoraMs: number): { ok: true } | { ok: false; mensaje: string } {
  const k = clave(tenantId, googleSub);
  const prev = envios.get(k) ?? [];
  const enHora = prev.filter((t) => ahoraMs - t < VENTANA_HORA_MS);
  const enDia = prev.filter((t) => ahoraMs - t < VENTANA_DIA_MS);
  if (enHora.length >= MAX_POR_HORA) {
    return { ok: false, mensaje: "Llegaste al límite de envíos por hora. Esperá un momento y probá de nuevo." };
  }
  if (enDia.length >= MAX_POR_DIA) {
    return { ok: false, mensaje: "Llegaste al límite de envíos por día. Mañana podés mandar más." };
  }
  envios.set(k, [...enDia, ahoraMs]);
  return { ok: true };
}
