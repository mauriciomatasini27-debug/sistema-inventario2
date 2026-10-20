import { describe, expect, it } from "vitest";
import {
  calcularRotacionLenta,
  calcularTopProductos,
  margenDeProducto,
  productosMenorMargen,
  buscarProductoPorTexto,
} from "../src/modules/ia/lecturas.js";

describe("IA-S2 top_productos", () => {
  it("suma cantidades por sku, resta devoluciones y ordena por cantidad desc", () => {
    const r = calcularTopProductos(
      [
        { sku: "A-1", nombre: "Yerba", cantidad: 3, totalCentavos: 4500n },
        { sku: "B-2", nombre: "Mate", cantidad: 5, totalCentavos: 1000n },
        { sku: "A-1", nombre: "Yerba", cantidad: 2, totalCentavos: 3000n },
        { sku: "C-3", nombre: "Azúcar", cantidad: 1, totalCentavos: 800n },
      ],
      [{ sku: "B-2", cantidad: 1 }],
      5,
    );

    expect(r).toEqual([
      { sku: "A-1", nombre: "Yerba", cantidad: 5, totalCentavos: "7500" },
      { sku: "B-2", nombre: "Mate", cantidad: 4, totalCentavos: "1000" },
      { sku: "C-3", nombre: "Azúcar", cantidad: 1, totalCentavos: "800" },
    ]);
  });

  it("desempata por sku y respeta el límite", () => {
    const r = calcularTopProductos(
      [
        { sku: "Z-9", nombre: "Zeta", cantidad: 2, totalCentavos: 200n },
        { sku: "A-1", nombre: "Alfa", cantidad: 2, totalCentavos: 200n },
        { sku: "M-5", nombre: "Mu", cantidad: 2, totalCentavos: 200n },
      ],
      [],
      2,
    );

    expect(r.map((p) => p.sku)).toEqual(["A-1", "M-5"]);
  });

  it("sin ventas devuelve lista vacía y no inventa filas", () => {
    expect(calcularTopProductos([], [], 5)).toEqual([]);
  });

  it("un producto con todas sus unidades devueltas no aparece", () => {
    const r = calcularTopProductos(
      [{ sku: "A-1", nombre: "Yerba", cantidad: 2, totalCentavos: 3000n }],
      [{ sku: "A-1", cantidad: 2 }],
      5,
    );
    expect(r).toEqual([]);
  });
});

describe("IA-S2 margen_producto", () => {
  it("calcula margen en centavos y porcentaje con precio y costo", () => {
    expect(
      margenDeProducto({
        sku: "A-1",
        nombre: "Yerba",
        precioCentavos: 10000n,
        costoCentavos: 6000n,
      }),
    ).toEqual({
      sku: "A-1",
      nombre: "Yerba",
      precioCentavos: "10000",
      costoCentavos: "6000",
      margenCentavos: "4000",
      margenPorcentaje: 40,
    });
  });

  it("sin costo no inventa margen", () => {
    expect(
      margenDeProducto({
        sku: "B-2",
        nombre: "Mate",
        precioCentavos: 5000n,
        costoCentavos: null,
      }),
    ).toEqual({
      sku: "B-2",
      nombre: "Mate",
      precioCentavos: "5000",
      costoCentavos: null,
      margenCentavos: null,
      margenPorcentaje: null,
    });
  });

  it("busca por sku exacto y por nombre", () => {
    const catalogo = [
      { sku: "A-1", nombre: "Yerba Compuesta", precioCentavos: 10000n, costoCentavos: 6000n },
      { sku: "B-2", nombre: "Mate Cocido", precioCentavos: 5000n, costoCentavos: null },
    ];

    expect(buscarProductoPorTexto(catalogo, "a-1")?.sku).toBe("A-1");
    expect(buscarProductoPorTexto(catalogo, "mate cocido")?.sku).toBe("B-2");
    expect(buscarProductoPorTexto(catalogo, "inexistente")).toBeNull();
  });

  it("sin producto devuelve los 5 de menor margen y excluye los sin costo", () => {
    const r = productosMenorMargen([
      { sku: "A-1", nombre: "Yerba", precioCentavos: 10000n, costoCentavos: 6000n },
      { sku: "B-2", nombre: "Mate", precioCentavos: 5000n, costoCentavos: null },
      { sku: "C-3", nombre: "Azúcar", precioCentavos: 900n, costoCentavos: 1000n },
      { sku: "D-4", nombre: "Café", precioCentavos: 1000n, costoCentavos: 800n },
    ]);

    expect(r.map((p) => p.sku)).toEqual(["C-3", "D-4", "A-1"]);
    expect(r[0]).toMatchObject({ margenCentavos: "-100", margenPorcentaje: -11.11 });
    expect(r.every((p) => p.costoCentavos !== null)).toBe(true);
  });
});

describe("IA-S2 rotacion_lenta", () => {
  it("ordena por unidades vendidas asc y stock desc, y excluye stock cero", () => {
    const r = calcularRotacionLenta(
      [
        { sku: "A-1", nombre: "Yerba", stock: 5 },
        { sku: "B-2", nombre: "Mate", stock: 2 },
        { sku: "C-3", nombre: "Azúcar", stock: 0 },
        { sku: "D-4", nombre: "Café", stock: 10 },
      ],
      [
        { sku: "A-1", tipo: "venta", cantidad: 3, ocurridoEn: "2026-10-02T12:00:00.000Z" },
        { sku: "A-1", tipo: "devolucion", cantidad: 3, ocurridoEn: "2026-10-03T12:00:00.000Z" },
        { sku: "B-2", tipo: "venta", cantidad: 1, ocurridoEn: "2026-10-04T12:00:00.000Z" },
      ],
      10,
    );

    expect(r.map((p) => p.sku)).toEqual(["D-4", "A-1", "B-2"]);
    expect(r.find((p) => p.sku === "A-1")).toEqual({
      sku: "A-1",
      nombre: "Yerba",
      stock: 5,
      unidadesVendidas: 0,
      ultimaVentaEl: "2026-10-02T12:00:00.000Z",
    });
    expect(r.find((p) => p.sku === "D-4")).toMatchObject({
      unidadesVendidas: 0,
      ultimaVentaEl: null,
    });
  });

  it("respeta el máximo de 10 filas", () => {
    const catalogo = Array.from({ length: 12 }, (_, i) => ({
      sku: `S-${String(i).padStart(2, "0")}`,
      nombre: `Producto ${i}`,
      stock: 10 - i,
    }));

    expect(calcularRotacionLenta(catalogo, [], 10)).toHaveLength(10);
  });
});
