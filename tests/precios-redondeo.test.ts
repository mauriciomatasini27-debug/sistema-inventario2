import { describe, expect, it } from "vitest";
import { redondearArriba, PASO_DEFECTO } from "../src/modules/pricing/redondeo.js";
import { calcularPrecioNuevo, brutoSinRedondeo } from "../src/modules/pricing/precios.js";

describe("precios redondeo GP7", () => {
  it("paso defecto es $10 (1000 centavos)", () => {
    expect(PASO_DEFECTO).toBe(1_000n);
  });

  it("valor ya múltiplo queda igual", () => {
    expect(redondearArriba(12_000n, 1_000n)).toBe(12_000n);
    expect(redondearArriba(0n, 1_000n)).toBe(0n);
  });

  it("redondea hacia arriba en cada paso", () => {
    expect(redondearArriba(1n, 100n)).toBe(100n);
    expect(redondearArriba(10_001n, 1_000n)).toBe(11_000n);
    expect(redondearArriba(10_001n, 5_000n)).toBe(15_000n);
    expect(redondearArriba(10_001n, 10_000n)).toBe(20_000n);
  });

  it("rechaza paso fuera de GP7 y montos negativos", () => {
    expect(() => redondearArriba(100n, 200n)).toThrow();
    expect(() => redondearArriba(-100n, 1_000n)).toThrow();
  });

  it("fórmula GP1: nuevo = vigente*(1+p) + redondeo arriba", () => {
    // $100 +10% = $110 exacto, ya múltiplo de $10.
    expect(calcularPrecioNuevo(10_000n, "suba", 10, 1_000n)).toEqual({
      brutoCentavos: 11_000n,
      nuevoCentavos: 11_000n,
    });
    // $100 +10% con paso $50 => $110 sube a $150.
    expect(calcularPrecioNuevo(10_000n, "suba", 10, 5_000n).nuevoCentavos).toBe(15_000n);
  });

  it("mitad-arriba: 1 centavo +50% = 1.5 => 2", () => {
    expect(brutoSinRedondeo(1n, "suba", 50)).toBe(2n);
    expect(brutoSinRedondeo(3n, "suba", 50)).toBe(5n);
  });

  it("baja también redondea hacia arriba", () => {
    // 10001 -10% = 9000.9 => bruto 9001 => techo $10 = 10000.
    const r = calcularPrecioNuevo(10_001n, "baja", 10, 1_000n);
    expect(r.brutoCentavos).toBe(9_001n);
    expect(r.nuevoCentavos).toBe(10_000n);
  });
});
