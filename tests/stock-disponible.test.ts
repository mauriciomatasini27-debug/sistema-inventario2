import { describe, expect, it } from "vitest";
import { derivarStockCatalogo, sumarHistorial } from "../src/modules/stock/stock-disponible.js";

describe("STOCK-R8: Stock disponible derivado del Historial", () => {
  it("suma delta por SKU y excluye la sobreventa marcada", () => {
    const suma = sumarHistorial([
      { sku: "A", delta: 10, tipo: "ALTA" },
      { sku: "A", delta: -3, tipo: "VENTA" },
      { sku: "A", delta: -2, tipo: "VENTA", motivo: "sobreventa" },
      { sku: "B", delta: 4, tipo: "ALTA" },
    ]);
    expect(suma.get("A")).toBe(7);
    expect(suma.get("B")).toBe(4);
  });

  it("muestra el número verificado y cuenta los productos bajo el mínimo", () => {
    const r = derivarStockCatalogo(
      [
        { sku: "A", minStock: 5, stockActual: 2 },
        { sku: "B", minStock: 5, stockActual: 8 },
        { sku: "C", minStock: null, stockActual: 0 },
      ],
      [
        { sku: "A", delta: 2, tipo: "ALTA" },
        { sku: "B", delta: 8, tipo: "ALTA" },
        { sku: "C", delta: 0, tipo: "ALTA" },
      ],
    );
    expect(r.celdas.get("A")).toBe(2);
    expect(r.bajoMinimo).toBe(1);
    expect(r.sinVerificar).toBe(0);
    expect(r.total).toBe(3);
    expect(r.conMinimo).toBe(2);
  });

  it("un desvío con la proyección muestra «—» y no cuenta para el KPI", () => {
    const r = derivarStockCatalogo(
      [{ sku: "A", minStock: 10, stockActual: 8 }],
      [{ sku: "A", delta: 7, tipo: "VENTA" }],
    );
    expect(r.celdas.get("A")).toBeNull();
    expect(r.sinVerificar).toBe(1);
    expect(r.bajoMinimo).toBe(0);
  });

  it("sin base en el Historial tampoco afirma un número", () => {
    const r = derivarStockCatalogo([{ sku: "A", minStock: 1, stockActual: 0 }], []);
    expect(r.celdas.get("A")).toBeNull();
    expect(r.sinVerificar).toBe(1);
  });

  it("verifica también el resto de lotes cuando el llamador lo pasa", () => {
    const producto = { sku: "A", minStock: 3, stockActual: 5, restanteLotes: 4 };
    const movimientos = [{ sku: "A", delta: 5, tipo: "ALTA" as const }];
    expect(derivarStockCatalogo([producto], movimientos).celdas.get("A")).toBeNull();
    expect(derivarStockCatalogo([{ ...producto, restanteLotes: 5 }], movimientos).celdas.get("A")).toBe(5);
  });
});
