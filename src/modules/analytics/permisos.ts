// Núcleo puro RT10: gates de rol. El filtrado financiero ocurre en el
// servidor (API + export + offline), nunca en el cliente.
import type { FilaRotacion, Grant } from "./tipos.js";

export const PERMISO_ROTACION = "ver_rotacion_unidades" as const;

export function puede_ver_tablero(grant: Grant): boolean {
  if (grant.rol === "dueno") return true;
  return grant.permisos.includes(PERMISO_ROTACION);
}

export function puede_exportar(grant: Grant): boolean {
  return grant.rol === "dueno";
}

export function puede_configurar(grant: Grant): boolean {
  return grant.rol === "dueno";
}

export function puede_marcar_promo(grant: Grant): boolean {
  return grant.rol === "dueno";
}

// Recorte servidor para Empleado: sin costo/valorizado ni financieros
// (ingresos, ganancia, margen, markup). El adaptador además bloquea orden
// por columnas financieras y export (403).
export type FilaEmpleado = Omit<
  FilaRotacion,
  "costoCentavos" | "valorizadoCentavos" | "ingresosCentavos" | "gananciaCentavos" | "margenBp" | "markupBp"
> & {
  readonly costoCentavos?: never;
  readonly valorizadoCentavos?: never;
  readonly ingresosCentavos?: never;
  readonly gananciaCentavos?: never;
  readonly margenBp?: never;
  readonly markupBp?: never;
};

export function recortar_para_rol(
  filas: ReadonlyArray<FilaRotacion>,
  grant: Grant,
): ReadonlyArray<FilaRotacion> | ReadonlyArray<FilaEmpleado> {
  if (grant.rol === "dueno") return filas;
  return filas.map((f) => {
    const {
      costoCentavos: _c,
      valorizadoCentavos: _v,
      ingresosCentavos: _i,
      gananciaCentavos: _g,
      margenBp: _m,
      markupBp: _k,
      ...resto
    } = f;
    return resto;
  });
}
