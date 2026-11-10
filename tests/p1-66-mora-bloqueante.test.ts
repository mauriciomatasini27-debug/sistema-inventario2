import { describe, expect, it } from "vitest";
import { MS_POR_DIA, esta_en_mora, situacion_mora, texto_bloqueo_mora } from "../src/modules/credit/saldos.js";

const HOY = 1_789_000_000_000;

describe("P1-66 situacion de mora", () => {
  it("15 días con saldo positivo es en_mora", () => {
    const s = situacion_mora([{ fecha: HOY - 15 * MS_POR_DIA }], 1n, HOY);
    expect(s).toEqual({ estado: "en_mora", diasMax: 15 });
  });

  it("un milisegundo antes de los 15 días sigue al día", () => {
    const s = situacion_mora([{ fecha: HOY - (15 * MS_POR_DIA - 1) }], 1n, HOY);
    expect(s).toEqual({ estado: "al_dia", diasMax: 14 });
  });

  it("una deuda de 15 días con saldo 0 queda al día", () => {
    const deudas = [{ fecha: HOY - 15 * MS_POR_DIA }];
    expect(esta_en_mora(deudas, HOY).estado).toBe("en_mora");
    expect(situacion_mora(deudas, 0n, HOY)).toEqual({ estado: "al_dia", diasMax: 15 });
  });

  it("saldo a favor con deuda vieja queda al día", () => {
    const s = situacion_mora([{ fecha: HOY - 15 * MS_POR_DIA }], -1n, HOY);
    expect(s).toEqual({ estado: "al_dia", diasMax: 15 });
  });

  it("sin deudas el máximo es 0", () => {
    expect(situacion_mora([], 100n, HOY)).toEqual({ estado: "al_dia", diasMax: 0 });
  });

  it("el 403 nombra los días y pide otro medio o al dueño", () => {
    expect(texto_bloqueo_mora(18)).toBe(
      "Este cliente está en mora: 18 días con saldo. Cobrá con otro medio o pedile al dueño.",
    );
  });
});
