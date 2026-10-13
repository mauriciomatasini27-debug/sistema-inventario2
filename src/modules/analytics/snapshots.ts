// Núcleo puro RT6: snapshot único WA+email (mismo objeto, mismos números).
// Patrón resumen-cierre: dedupeKey estable + 409 en reintento.
import type { FilaRotacion, OrigenSnapshot, SnapshotRotacion } from "./tipos.js";
import { ranking_neto } from "./selectores.js";

export function clave_snapshot(desde: string, hasta: string, origen: OrigenSnapshot): string {
  return `rotacion:${desde}:${hasta}:${origen}`;
}

export function describir_snapshot(args: {
  readonly id: string;
  readonly desde: string;
  readonly hasta: string;
  readonly filas: ReadonlyArray<FilaRotacion>;
  readonly origen: OrigenSnapshot;
  readonly creadoEn: string;
}): SnapshotRotacion {
  return {
    id: args.id,
    dedupeKey: clave_snapshot(args.desde, args.hasta, args.origen),
    desde: args.desde,
    hasta: args.hasta,
    filas: args.filas,
    creadoEn: args.creadoEn,
    origen: args.origen,
  };
}

export function encolar_snapshot(
  tienda: Map<string, SnapshotRotacion>,
  snap: SnapshotRotacion,
): { readonly status: 201 | 409; readonly error?: string } {
  if (tienda.has(snap.dedupeKey)) return { status: 409, error: "snapshot ya generado" };
  tienda.set(snap.dedupeKey, snap);
  return { status: 201 };
}

export interface ResumenRotacion {
  readonly top: ReadonlyArray<{ readonly nombre: string; readonly neto: number }>;
  readonly reponer: ReadonlyArray<{ readonly nombre: string; readonly cobertura: number | null }>;
  readonly dormidos: number;
  readonly inmovilizadoCentavos: bigint;
}

// Texto corto bot (top 3, un solo mensaje). El email usa el mismo snapshot
// con top 10 (ver adaptador).
export function cuerpo_wa(args: {
  readonly nombreComercio: string;
  readonly desde: string;
  readonly hasta: string;
  readonly resumen: ResumenRotacion;
}): string {
  const top = args.resumen.top
    .slice(0, 3)
    .map((t) => `${t.nombre} (${t.neto})`)
    .join(", ");
  const rep = args.resumen.reponer
    .slice(0, 3)
    .map((t) => `${t.nombre} (${t.cobertura ?? "—"} d)`)
    .join(", ");
  return (
    `Rotación ${args.nombreComercio} (${args.desde} al ${args.hasta})\n` +
    `Más vendidos: ${top || "—"}.\n` +
    `Reponer primero: ${rep || "—"}.\n` +
    `Dormidos: ${args.resumen.dormidos} productos.`
  );
}

export function top_n(filas: ReadonlyArray<FilaRotacion>, n: number): FilaRotacion[] {
  return ranking_neto(filas).slice(0, n);
}
