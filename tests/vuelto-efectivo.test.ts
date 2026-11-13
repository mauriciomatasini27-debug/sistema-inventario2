import { describe, expect, it } from "vitest";
import { evaluarVueltoEfectivo, totalCentavosCarrito } from "../src/modules/sales/vuelto_efectivo.js";

describe("vuelto efectivo (TB-162)", () => {
  it("sin monto recibido deja confirmar", () => {
    expect(evaluarVueltoEfectivo(32_000, "")).toEqual({ ok: true, modo: "sin_recibido" });
    expect(evaluarVueltoEfectivo(32_000, "   ")).toEqual({ ok: true, modo: "sin_recibido" });
  });

  it("recibido mayor al total devuelve el vuelto en centavos", () => {
    expect(evaluarVueltoEfectivo(3_200, "5.000,00")).toEqual({
      ok: true,
      modo: "vuelto",
      recibidoCentavos: 500_000,
      vueltoCentavos: 496_800,
    });
    expect(evaluarVueltoEfectivo(3_200, "32,00")).toEqual({
      ok: true,
      modo: "vuelto",
      recibidoCentavos: 3_200,
      vueltoCentavos: 0,
    });
  });

  it("recibido menor no confirma", () => {
    expect(evaluarVueltoEfectivo(3_200, "10,00")).toEqual({ ok: false, codigo: "recibido_insuficiente" });
  });

  it("monto inválido no confirma", () => {
    expect(evaluarVueltoEfectivo(100, "abc")).toEqual({ ok: false, codigo: "recibido_invalido" });
  });

  it("totalCentavosCarrito suma líneas", () => {
    expect(
      totalCentavosCarrito([
        { qty: 2, precio_centavos: 150 },
        { qty: 1, precio_centavos: 50 },
      ]),
    ).toBe(350);
  });
});
