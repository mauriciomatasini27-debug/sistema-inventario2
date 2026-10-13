// Núcleo puro de avisos de sync (SYNC-S4, PRD-SYNC-01, OF5/OF12/OF14).
// Sin IO: decide nivel por horas sin sync. Umbrales: 24h avisa, 60h avisa,
// 72h cuarentena + "Necesita conexión".
export type NivelAvisoSync = 24 | 60 | 72;

export function horasSinSync(ultimaVistaEn: string, ahora: Date = new Date()): number {
  const t = new Date(ultimaVistaEn).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (ahora.getTime() - t) / 3_600_000);
}

/** Nivel de aviso por antigüedad, o null si está al día. Puro. */
export function nivelAviso(horas: number): NivelAvisoSync | null {
  if (horas >= 72) return 72;
  if (horas >= 60) return 60;
  if (horas >= 24) return 24;
  return null;
}

/** ¿Entra en cuarentena? A las 72h vende igual pero nada sensible: "Necesita conexión". */
export function enCuarentena(horas: number): boolean {
  return horas >= 72;
}
