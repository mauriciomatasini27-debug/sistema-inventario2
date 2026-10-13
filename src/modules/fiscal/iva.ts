// IVA para Factura B (FE-S12, ADR-0018 D7).
// Núcleo puro: desagrega un total cobrado (IVA incluido) en neto + IVA por
// alícuota, con prorrateo mayor-resto. Sin IO, sin Drizzle.
export const ALIC_IVA_21_ID = 5 as const;
export const ALIC_IVA_21_TASA_NUM = 21 as const;
export const ALIC_IVA_21_TASA_DEN = 121 as const;

export interface DesagregadoIva {
  readonly impNetoCentavos: bigint;
  readonly impIvaCentavos: bigint;
  readonly impTotalCentavos: bigint;
  readonly alicId: number;
  readonly baseImpCentavos: bigint;
  readonly importeIvaCentavos: bigint;
}

// Desagrega total (IVA incluido) con tasa num/den sobre el total.
// Redondeo half-up a centavo: iva = (total*num + den/2) / den.
export function desagregar_iva(
  totalCentavos: bigint,
  alicId: number,
  tasaNum: number,
  tasaDen: number,
): DesagregadoIva | null {
  if (totalCentavos <= 0n) return null;
  if (!Number.isInteger(alicId) || alicId < 1 || alicId > 9) return null;
  if (!Number.isInteger(tasaNum) || tasaNum < 0 || !Number.isInteger(tasaDen) || tasaDen <= 0) return null;
  const num = BigInt(tasaNum);
  const den = BigInt(tasaDen);
  const iva = (totalCentavos * num + den / 2n) / den;
  const neto = totalCentavos - iva;
  if (neto < 0n || iva < 0n) return null;
  if (neto + iva !== totalCentavos) return null;
  return {
    impNetoCentavos: neto,
    impIvaCentavos: iva,
    impTotalCentavos: totalCentavos,
    alicId,
    baseImpCentavos: neto,
    importeIvaCentavos: iva,
  };
}

// Atajo B por defecto: 21% (Id 5). El total facturado ya incluye el IVA.
export function desagregar_iva_21(totalCentavos: bigint): DesagregadoIva | null {
  return desagregar_iva(totalCentavos, ALIC_IVA_21_ID, ALIC_IVA_21_TASA_NUM, ALIC_IVA_21_TASA_DEN);
}
