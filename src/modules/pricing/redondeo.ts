// LANE C — Redondeo GP7 (ADR-0004). Núcleo puro: sin IO, sin Drizzle.
// Paso en centavos para no usar floats con dinero. Dirección siempre "arriba".

export const PASOS_PERMITIDOS = [100n, 1_000n, 5_000n, 10_000n] as const;
export type PasoRedondeo = (typeof PASOS_PERMITIDOS)[number];

// GP7: $1 / $10 / $50 / $100, defecto $10.
export const PASO_DEFECTO: PasoRedondeo = 1_000n;
export type DireccionRedondeo = "arriba";

export function esPasoValido(paso: bigint): paso is PasoRedondeo {
  return (PASOS_PERMITIDOS as readonly bigint[]).includes(paso);
}

function exigirPaso(paso: bigint): asserts paso is PasoRedondeo {
  if (!esPasoValido(paso)) throw new Error("paso de redondeo inválido (GP7: $1/$10/$50/$100)");
}

// Por qué techo y no mitad: GP7 fija dirección arriba; el kiosco nunca cobra
// de menos por redondeo. Valor ya múltiplo queda igual (idempotente).
export function redondearArriba(valorCentavos: bigint, pasoCentavos: bigint): bigint {
  exigirPaso(pasoCentavos);
  if (valorCentavos < 0n) throw new Error("no se redondea monto negativo");
  const resto = valorCentavos % pasoCentavos;
  if (resto === 0n) return valorCentavos;
  return valorCentavos + (pasoCentavos - resto);
}
