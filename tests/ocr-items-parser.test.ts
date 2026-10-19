import { describe, expect, it } from "vitest";
import { extraer_items } from "../src/modules/ocr/motor.js";

describe("extraer_items no inventa ítems con ruido del OCR (ADR-0094)", () => {
  it("extrae las líneas con precio y conserva el importe de cada una", () => {
    expect(extraer_items("2 x Yerba 500g $5.000,00\n1 Azucar $1.200")).toEqual([
      { cantidad: 2, descripcion: "Yerba 500g", importeTexto: "$5.000,00" },
      { cantidad: 1, descripcion: "Azucar", importeTexto: "$1.200" },
    ]);
  });

  it("extrae importes con coma decimal aunque no lleven $", () => {
    expect(extraer_items("2 x Yerba 5000,00\n3 YERBA 1500,00")).toEqual([
      { cantidad: 2, descripcion: "Yerba", importeTexto: "5000,00" },
      { cantidad: 3, descripcion: "YERBA", importeTexto: "1500,00" },
    ]);
  });

  it("no extrae ítems de un encabezado con CUIT, fecha y total", () => {
    expect(extraer_items("CUIT 20-93333172-6\nFecha 10/10/2026\nTotal $ 164.800,00")).toEqual([]);
  });

  it("no extrae un entero pelado ni un teléfono", () => {
    expect(extraer_items("4 PRODUCTO 1500")).toEqual([]);
    expect(extraer_items("Tel 4921-1234")).toEqual([]);
  });

  it("no extrae cuando la descripción es una etiqueta", () => {
    expect(extraer_items("2 FACTURA 1.200")).toEqual([]);
    expect(extraer_items("2 PERCEPCIÓN 1.200")).toEqual([]);
  });
});
