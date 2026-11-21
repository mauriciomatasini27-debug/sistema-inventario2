import { describir_snapshot, encolar_snapshot } from "../modules/analytics/snapshots.js";
import { calcular_rotacion } from "../modules/analytics/agregador.js";
import { fuente_memoria } from "../modules/analytics/fuente.js";
import { fechaAR, sumarDiasAR } from "../lib/fecha-ar.js";
import type { FilaRotacion, SnapshotRotacion, SkuRot } from "../modules/analytics/tipos.js";

const corridas = new Map<string, SnapshotRotacion>();

// Filas RT2 vivas de la ventana de 7 días (fuente en memoria en slice-0).
// Compartido con el bot de quiosco (BOT-S3) para no repetir el armado.
export function filas_rotacion(ahora = new Date()): FilaRotacion[] {
  const hoy = fechaAR(ahora);
  const desde = sumarDiasAR(hoy, -6);
  const { movimientos, catalogo } = fuente_memoria();
  const r = calcular_rotacion({
    movimientos,
    stockInicial: new Map<SkuRot, number>(),
    catalogo,
    params: { desde, hasta: hoy, hoy, ventanaCoberturaDias: 28 },
  });
  return r.ok ? [...r.valor] : [];
}

export function es_viernes_18h(ahora = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const partes = fmt.formatToParts(ahora);
  const dia = partes.find((p) => p.type === "weekday")?.value ?? "";
  const hora = partes.find((p) => p.type === "hour")?.value ?? "";
  return dia === "Fri" && hora === "18";
}

export function ejecutar_resumen_rotacion(ahora = new Date()): {
  ya: boolean;
  snapshot: SnapshotRotacion | null;
} {
  const hoy = fechaAR(ahora);
  const desde = sumarDiasAR(hoy, -6);
  const key = `rotacion:${desde}:${hoy}:viernes18h`;
  const previo = corridas.get(key);
  if (previo) return { ya: true, snapshot: previo };
  const filas = filas_rotacion(ahora);
  const snap = describir_snapshot({
    id: crypto.randomUUID(),
    desde,
    hasta: hoy,
    filas,
    origen: "viernes18h",
    creadoEn: ahora.toISOString(),
  });
  const e = encolar_snapshot(corridas, snap);
  if (e.status === 409) {
    const s = corridas.get(key);
    return { ya: true, snapshot: s ?? null };
  }
  return { ya: false, snapshot: snap };
}
