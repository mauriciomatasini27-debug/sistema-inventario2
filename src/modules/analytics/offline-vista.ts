// RT11: vista offline compacta (7d/30d/mes). Solo agregados por producto,
// nunca movimientos. El snapshot del Empleado ya viene recortado (RT10.2).
import type { FilaRotacion, SnapshotRotacion } from "./tipos.js";

export interface OfflinePack {
  readonly alcance: "7d" | "30d" | "mes";
  readonly generadoEn: string;
  readonly aviso: string;
  readonly filas: ReadonlyArray<FilaRotacion>;
  readonly snapshotId: string;
}

export function armar_offline_pack(args: {
  readonly alcance: "7d" | "30d" | "mes";
  readonly snapshot: SnapshotRotacion;
  readonly generadoEn: string;
}): OfflinePack {
  return {
    alcance: args.alcance,
    generadoEn: args.generadoEn,
    aviso: `Sin conexión — datos al ${args.generadoEn}`,
    filas: args.snapshot.filas,
    snapshotId: args.snapshot.id,
  };
}

export function estima_bytes(filas: number): number {
  // ~200B por fila agregada (8.000 filas ≈ 1,6 MB, dentro de 1-2 MB PRD).
  return filas * 200;
}
