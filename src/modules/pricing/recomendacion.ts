// LANE C — Recomendación mensual GP6 (ADR-0004). Función pura aparte.
// Determinista: mismos insumos => mismo precio. Sin Date.now, sin random,
// sin IO. El precio manual siempre prevalece (ver elegirPrecioEnTicket en
// precios.ts); esto solo sugiere. Retiro del dueño se modela aparte para
// poder mostrar con/sin retiro.

import { redondearArriba } from "./redondeo.js";

export interface InsumosRecomendacion {
  readonly costoCentavos: bigint;
  readonly gastosMensualesCentavos: bigint;
  readonly unidadesMensuales: number;
  readonly incluirRetiro: boolean;
  readonly retiroDuenoCentavos?: bigint;
  readonly markupObjetivoPct?: number;
  readonly pasoCentavos?: bigint;
}

export interface Recomendacion {
  readonly precioBrutoCentavos: bigint;
  readonly precioSugeridoCentavos: bigint;
  readonly costoUnitarioExtraCentavos: bigint;
  readonly conRetiro: boolean;
}

// Mitad-arriba con enteros: (num + den/2) / den. Sin floats con dinero.
function prorratearMitadArriba(total: bigint, unidades: number): bigint {
  const den = BigInt(unidades);
  return (total + den / 2n) / den;
}

export function recomendarPrecio(insumos: InsumosRecomendacion): Recomendacion {
  if (insumos.costoCentavos < 0n) throw new Error("costo negativo");
  if (insumos.gastosMensualesCentavos < 0n) throw new Error("gastos negativos");
  if (!Number.isInteger(insumos.unidadesMensuales) || insumos.unidadesMensuales <= 0) {
    throw new Error("unidades mensuales inválidas");
  }
  const retiro = insumos.incluirRetiro ? (insumos.retiroDuenoCentavos ?? 0n) : 0n;
  if (retiro < 0n) throw new Error("retiro negativo");
  const markup = insumos.markupObjetivoPct ?? 0;
  if (!Number.isFinite(markup) || markup < 0 || markup > 1000) {
    throw new Error("markup objetivo fuera de rango 0-1000");
  }
  const paso = insumos.pasoCentavos ?? 1_000n;

  const total = insumos.gastosMensualesCentavos + retiro;
  const extra = prorratearMitadArriba(total, insumos.unidadesMensuales);
  const base = insumos.costoCentavos + extra;
  // Aplica markup objetivo sobre la base, mitad-arriba.
  const markupCents = Math.round(markup * 100);
  const bruto = (base * (10_000n + BigInt(markupCents)) + 5_000n) / 10_000n;
  const sugerido = redondearArriba(bruto, paso);
  return Object.freeze({
    precioBrutoCentavos: bruto,
    precioSugeridoCentavos: sugerido,
    costoUnitarioExtraCentavos: extra,
    conRetiro: insumos.incluirRetiro,
  });
}
