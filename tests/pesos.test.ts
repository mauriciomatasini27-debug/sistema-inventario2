import { describe, expect, it } from "vitest";
import { formatearPesos, mensajePesos, parsearPesos, pesosParaInput } from "../src/lib/pesos.js";

describe("parsearPesos: formato es-AR", () => {
  it.each([
    ["1.234,50", 123450],
    ["1.234,5", 123450],
    ["1234,5", 123450],
    ["1234", 123400],
    ["1.234", 123400],
    ["1.234.567,89", 123456789],
    ["1234.50", 123450],
    ["1234.5", 123450],
    ["$ 1.234,50", 123450],
    ["  $  1.234,50  ", 123450],
    ["0", 0],
    ["0,5", 50],
    ["0,05", 5],
    ["1.000,01", 100001],
    ["1.234.567", 123456700],
    ["9.999.999,99", 999999999],
  ])("%s -> %i centavos", (texto, centavos) => {
    expect(parsearPesos(texto)).toEqual({ ok: true, centavos });
  });

  it("vacío es vacio y los espacios solos también", () => {
    expect(parsearPesos("")).toEqual({ ok: false, motivo: "vacio" });
    expect(parsearPesos("   ")).toEqual({ ok: false, motivo: "vacio" });
  });

  it("el signo menos es negativo", () => {
    expect(parsearPesos("-5")).toEqual({ ok: false, motivo: "negativo" });
    expect(parsearPesos("- $ 5")).toEqual({ ok: false, motivo: "negativo" });
    expect(parsearPesos("$ -5")).toEqual({ ok: false, motivo: "negativo" });
  });

  it("más de 2 decimales es decimales", () => {
    expect(parsearPesos("1,234")).toEqual({ ok: false, motivo: "decimales" });
    expect(parsearPesos("1,2345")).toEqual({ ok: false, motivo: "decimales" });
  });

  it("miles mal formados o letras son invalido", () => {
    expect(parsearPesos("1.23,5")).toEqual({ ok: false, motivo: "invalido" });
    expect(parsearPesos("12.34.56")).toEqual({ ok: false, motivo: "invalido" });
    expect(parsearPesos("abc")).toEqual({ ok: false, motivo: "invalido" });
    expect(parsearPesos("1a2")).toEqual({ ok: false, motivo: "invalido" });
    expect(parsearPesos("$")).toEqual({ ok: false, motivo: "invalido" });
    expect(parsearPesos("1,")).toEqual({ ok: false, motivo: "invalido" });
    expect(parsearPesos(",50")).toEqual({ ok: false, motivo: "invalido" });
  });

  it("el tope es 9.999.999,99 pesos", () => {
    expect(parsearPesos("10.000.000")).toEqual({ ok: false, motivo: "invalido" });
    expect(parsearPesos("10.000.000,00")).toEqual({ ok: false, motivo: "invalido" });
    expect(parsearPesos("10000000")).toEqual({ ok: false, motivo: "invalido" });
  });
});

describe("formatearPesos", () => {
  it("formatea centavos como pesos es-AR con espacio normal", () => {
    expect(formatearPesos(123450)).toBe("$ 1.234,50");
    expect(formatearPesos("123450")).toBe("$ 1.234,50");
    expect(formatearPesos(123450n)).toBe("$ 1.234,50");
    expect(formatearPesos(0)).toBe("$ 0,00");
    expect(formatearPesos(999999999)).toBe("$ 9.999.999,99");
  });

  it("un valor inválido cae a $ 0,00", () => {
    expect(formatearPesos("no-es-un-numero")).toBe("$ 0,00");
  });
});

describe("pesosParaInput", () => {
  it("devuelve coma decimal y sin separador de miles", () => {
    expect(pesosParaInput(123450)).toBe("1234,50");
    expect(pesosParaInput(123400)).toBe("1234,00");
    expect(pesosParaInput(50)).toBe("0,50");
    expect(pesosParaInput("123450")).toBe("1234,50");
    expect(pesosParaInput(123450n)).toBe("1234,50");
  });

  it("null o inválido devuelve vacío", () => {
    expect(pesosParaInput(null)).toBe("");
    expect(pesosParaInput("no-es-un-numero")).toBe("");
  });
});

describe("mensajePesos", () => {
  it("explica cada motivo en rioplatense", () => {
    expect(mensajePesos("vacio")).toBe("Escribí un monto");
    expect(mensajePesos("negativo")).toBe("El monto no puede ser negativo");
    expect(mensajePesos("decimales")).toBe("Usá hasta 2 decimales, con coma (ej. 1.234,50)");
    expect(mensajePesos("invalido")).toBe("Monto inválido, ej. 1.234,50");
  });
});
