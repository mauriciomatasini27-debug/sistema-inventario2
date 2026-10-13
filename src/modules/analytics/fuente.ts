// Adaptador P0: construye la entrada del agregador desde el store en memoria
// (slice-0 monoproceso) con best-effort Drizzle cuando hay DB viva.
// Limitación honesta P0: store.stockMoves no guarda fecha; en memoria toda la
// ventana cae dentro del período pedido. Con Postgres se filtra por fecha real.
import { store } from "../../lib/store.js";
import type { FotoCatalogo, MovimientoVentana, SkuRot } from "./tipos.js";

export function fuente_memoria(): { movimientos: MovimientoVentana[]; catalogo: FotoCatalogo[] } {
  const ahora = new Date();
  const movimientos: MovimientoVentana[] = store.stockMoves.map((m, i) => ({
    sku: m.sku as SkuRot,
    delta: m.delta,
    tipo: m.tipo,
    creadoEn: ahora,
    eventoId: `${m.idemKey}:${i}`,
  }));
  const skus = new Set<string>([...store.stock.keys(), ...store.stockMoves.map((m) => m.sku)]);
  const catalogo: FotoCatalogo[] = [...skus].map((sku) => ({
    sku: sku as SkuRot,
    nombre: sku,
    categoria: null,
    ubicacion: null,
    costoCentavos: 0n,
    precioCentavos: 0n,
    excluidoDormidos: false,
    stockActual: store.stock.get(sku) ?? 0,
  }));
  return { movimientos, catalogo };
}

export function aJsonFilas(
  filas: ReadonlyArray<{
    sku: string;
    nombre: string;
    neto: number;
    bruto: number;
    devuelto: number;
    rotacion: number | null;
    coberturaDias: number | null;
    ventaDiaria: number | null;
    stockPromedio: number;
    vecesRepuesto: number;
    diasSinVenta: number;
    stockFinal: number;
    pocosDatos: boolean;
  }>,
  conFinanciero: boolean,
  filasFull?: ReadonlyArray<{ sku: string; valorizadoCentavos: bigint }>,
) {
  const val = new Map((filasFull ?? []).map((f) => [f.sku, f.valorizadoCentavos.toString()]));
  return filas.map((f) => ({
    ...f,
    ...(conFinanciero ? { valorizado_centavos: val.get(f.sku) ?? "0" } : {}),
  }));
}
