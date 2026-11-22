const MOTIVO_SOBREVENTA = "sobreventa";

export interface MovimientoHistorial {
  readonly sku: string;
  readonly delta: number;
  readonly tipo?: string;
  readonly motivo?: string | undefined;
}

export interface FilaStockCatalogo {
  readonly sku: string;
  readonly minStock: number | null;
  readonly stockActual: number;
  readonly restanteLotes?: number | undefined;
}

export interface ResultadoStockCatalogo {
  readonly celdas: ReadonlyMap<string, number | null>;
  readonly sinVerificar: number;
  readonly bajoMinimo: number;
  readonly total: number;
  readonly conMinimo: number;
}

export function sumarHistorial(movimientos: readonly MovimientoHistorial[]): Map<string, number> {
  const suma = new Map<string, number>();
  for (const m of movimientos) {
    if (m.motivo === MOTIVO_SOBREVENTA) continue;
    suma.set(m.sku, (suma.get(m.sku) ?? 0) + m.delta);
  }
  return suma;
}

export function derivarStockCatalogo(
  productos: readonly FilaStockCatalogo[],
  movimientos: readonly MovimientoHistorial[],
): ResultadoStockCatalogo {
  const historial = sumarHistorial(movimientos);
  const celdas = new Map<string, number | null>();
  let sinVerificar = 0;
  let bajoMinimo = 0;
  let conMinimo = 0;

  for (const p of productos) {
    if (p.minStock !== null && p.minStock !== undefined) conMinimo += 1;
    const disponible = historial.get(p.sku);
    const coincideLotes = p.restanteLotes === undefined || p.restanteLotes === disponible;
    if (disponible === undefined || disponible !== p.stockActual || !coincideLotes) {
      celdas.set(p.sku, null);
      sinVerificar += 1;
      continue;
    }
    celdas.set(p.sku, disponible);
    if (p.minStock !== null && p.minStock !== undefined && disponible < p.minStock) bajoMinimo += 1;
  }

  return { celdas, sinVerificar, bajoMinimo, total: productos.length, conMinimo };
}
