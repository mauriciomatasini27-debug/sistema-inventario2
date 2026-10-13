// Job RT6: resumen semanal viernes 18:00 America/Argentina/Buenos_Aires.
// Integrado al resumen del viernes (B9) por defecto: 0 plantillas adicionales.
// Idempotente por dedupeKey rotacion:{desde}:{hasta}:viernes18h.
import { describir_snapshot, encolar_snapshot } from "../modules/analytics/snapshots.js";
import { calcular_rotacion } from "../modules/analytics/agregador.js";
import { fuente_memoria } from "../modules/analytics/fuente.js";
import type { SnapshotRotacion, SkuRot } from "../modules/analytics/tipos.js";

const corridas = new Map<string, SnapshotRotacion>();

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
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);
  const desde = new Date(Date.parse(hoy + "T00:00:00Z") - 6 * 86400000).toISOString().slice(0, 10);
  const key = `rotacion:${desde}:${hoy}:viernes18h`;
  const previo = corridas.get(key);
  if (previo) return { ya: true, snapshot: previo };
  const { movimientos, catalogo } = fuente_memoria();
  const r = calcular_rotacion({
    movimientos,
    stockInicial: new Map<SkuRot, number>(),
    catalogo,
    params: { desde, hasta: hoy, hoy, ventanaCoberturaDias: 28 },
  });
  if (!r.ok) return { ya: false, snapshot: null };
  const snap = describir_snapshot({
    id: crypto.randomUUID(),
    desde,
    hasta: hoy,
    filas: r.valor,
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
