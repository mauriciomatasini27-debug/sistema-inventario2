// Núcleo puro B14: resumen de cierre por WA. Sin IO.
// Dispara en el cierre (manual/auto) una vez por jornada, con el snapshot
// exacto del cierre sin recalcular. Solo dueño o empleado con ver saldos.

import { formatear_pesos } from "../email/plantilla-cierre.js";

export const PLANTILLA_CIERRE_CAJA = "resumen_cierre_caja" as const;

export interface SnapshotCaja {
  readonly tenantId: string;
  readonly cierreId: string;
  readonly fechaJornada: string;
  readonly totalCentavos: bigint;
  readonly porMedio: Readonly<Record<string, bigint>>;
  readonly tipo: "manual" | "automatica";
  readonly nombreComercio: string;
}

export interface ResumenCierreWa {
  readonly plantilla: typeof PLANTILLA_CIERRE_CAJA;
  readonly texto: string;
  readonly botones: ReadonlyArray<{ readonly id: string; readonly titulo: string }>;
  readonly idempotencyKey: string;
}

export function clave_cierre_wa(tenantId: string, fechaJornada: string): string {
  return `resumen_cierre:wa:${tenantId}:${fechaJornada}`;
}

// Permiso ver saldos: dueño siempre; empleado solo con el permiso.
export function puede_ver_cierre(
  rol: "dueno" | "empleado",
  permisos: ReadonlyArray<string> = [],
): boolean {
  if (rol === "dueno") return true;
  return permisos.includes("ver_saldos");
}

// Arma la plantilla desde el snapshot tal cual viene: no recalcula,
// solo formatea. El orden por medio es descendente por monto.
export function armar_cierre_wa(snapshot: SnapshotCaja): ResumenCierreWa {
  const filas = Object.entries(snapshot.porMedio)
    .map(([medio, monto]) => ({ medio, monto }))
    .sort((a, b) => (a.monto > b.monto ? -1 : a.monto < b.monto ? 1 : 0));
  const tipoTxt = snapshot.tipo === "manual" ? "manual" : "automático";
  const detalle =
    filas.length > 0
      ? filas.map((f) => `${f.medio}: ${formatear_pesos(f.monto)}`).join(" · ")
      : "sin movimientos por medio";
  const texto =
    `${snapshot.nombreComercio} · cierre ${tipoTxt} ${snapshot.fechaJornada}\n` +
    `Resultado ${formatear_pesos(snapshot.totalCentavos)}\n${detalle}`;
  return {
    plantilla: PLANTILLA_CIERRE_CAJA,
    texto,
    botones: [{ id: "ver_detalle_cierre", titulo: "Ver detalle" }],
    idempotencyKey: clave_cierre_wa(snapshot.tenantId, snapshot.fechaJornada),
  };
}

export type TiendaCierreWa = Map<string, string>;

export type DecisionCierre =
  | { readonly ok: true; readonly resumen: ResumenCierreWa }
  | { readonly ok: false; readonly motivo: "sin_permiso" | "duplicado_jornada" };

// Una vez por jornada: si la clave ya está en la tienda, no duplica.
export function decidir_envio_cierre(
  tienda: TiendaCierreWa,
  args: {
    snapshot: SnapshotCaja;
    rol: "dueno" | "empleado";
    permisos?: ReadonlyArray<string> | undefined;
  },
): DecisionCierre {
  if (!puede_ver_cierre(args.rol, args.permisos ?? [])) return { ok: false, motivo: "sin_permiso" };
  const key = clave_cierre_wa(args.snapshot.tenantId, args.snapshot.fechaJornada);
  if (tienda.has(key)) return { ok: false, motivo: "duplicado_jornada" };
  const resumen = armar_cierre_wa(args.snapshot);
  tienda.set(key, args.snapshot.cierreId);
  return { ok: true, resumen };
}
