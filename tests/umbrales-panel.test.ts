import { describe, expect, it } from "vitest";
import {
  analizarGuardado,
  borradoresDeSector,
  borradoresIniciales,
  parsearCampo,
  payloadDeshacer,
  sectoresDe,
  sugeridoMinimo,
  type ProductoUmbral,
} from "../src/lib/umbrales-panel.js";

const productos: ProductoUmbral[] = [
  { sku: "A-1", nombre: "Alfajor", sector: "kiosco", minStock: null, reorderQty: null },
  { sku: "B-2", nombre: "Bebida", sector: "bebidas", minStock: 5, reorderQty: 12 },
  { sku: "C-3", nombre: "Café", sector: "kiosco", minStock: 2, reorderQty: null },
];

describe("umbrales-panel: parseo de un campo", () => {
  it("vacío es sin valor (null)", () => {
    expect(parsearCampo("", "min_stock")).toEqual({ ok: true, valor: null });
    expect(parsearCampo("   ", "reorder_qty")).toEqual({ ok: true, valor: null });
  });

  it("acepta enteros y recorta espacios", () => {
    expect(parsearCampo("10", "min_stock")).toEqual({ ok: true, valor: 10 });
    expect(parsearCampo(" 7 ", "reorder_qty")).toEqual({ ok: true, valor: 7 });
    expect(parsearCampo("0", "min_stock")).toEqual({ ok: true, valor: 0 });
  });

  it("rechaza negativos, decimales y basura con el mensaje del campo", () => {
    expect(parsearCampo("-1", "min_stock")).toEqual({ ok: false, error: "Poné un número entero desde 0" });
    expect(parsearCampo("2.5", "min_stock")).toEqual({ ok: false, error: "Poné un número entero desde 0" });
    expect(parsearCampo("abc", "min_stock")).toEqual({ ok: false, error: "Poné un número entero desde 0" });
    expect(parsearCampo("0", "reorder_qty")).toEqual({ ok: false, error: "Poné un número entero desde 1" });
    expect(parsearCampo("-3", "reorder_qty")).toEqual({ ok: false, error: "Poné un número entero desde 1" });
    expect(parsearCampo("1e3", "reorder_qty")).toEqual({ ok: false, error: "Poné un número entero desde 1" });
  });
});

describe("umbrales-panel: diff de filas cambiadas", () => {
  it("solo devuelve cambios reales y omite filas sin tocar", () => {
    const borradores = borradoresIniciales(productos);
    borradores.set("A-1", { min: "5", reorder: "" });
    borradores.set("B-2", { min: "5", reorder: "12" });
    borradores.set("C-3", { min: "", reorder: "4" });
    const r = analizarGuardado(productos, borradores);
    expect([...r.errores.keys()]).toEqual([]);
    expect(r.cambios).toEqual([
      { sku: "A-1", min_stock: 5, reorder_qty: null },
      { sku: "C-3", min_stock: null, reorder_qty: 4 },
    ]);
  });

  it("una fila inválida reporta error y no manda cambio", () => {
    const borradores = borradoresIniciales(productos);
    borradores.set("A-1", { min: "-2", reorder: "" });
    borradores.set("C-3", { min: "9", reorder: "" });
    const r = analizarGuardado(productos, borradores);
    expect(r.errores.get("A-1")).toEqual({ min_stock: "Poné un número entero desde 0" });
    expect(r.errores.has("C-3")).toBe(false);
    expect(r.cambios).toEqual([{ sku: "C-3", min_stock: 9, reorder_qty: null }]);
  });

  it("sin borrador usa los valores guardados (no inventa cambios)", () => {
    const r = analizarGuardado(productos, new Map());
    expect(r.cambios).toEqual([]);
    expect([...r.errores.keys()]).toEqual([]);
  });
});

describe("umbrales-panel: payload de deshacer", () => {
  it("restaura los valores previos de cada sku cambiado", () => {
    const cambios = [
      { sku: "A-1", min_stock: 5, reorder_qty: 3 },
      { sku: "B-2", min_stock: null, reorder_qty: null },
    ];
    expect(payloadDeshacer(productos, cambios)).toEqual([
      { sku: "A-1", min_stock: null, reorder_qty: null },
      { sku: "B-2", min_stock: 5, reorder_qty: 12 },
    ]);
  });

  it("ignora skus desconocidos", () => {
    expect(payloadDeshacer(productos, [{ sku: "Z-9", min_stock: 1, reorder_qty: 1 }])).toEqual([]);
  });
});

describe("umbrales-panel: categorías y edición masiva por sector", () => {
  it("lista sectores únicos y ordenados", () => {
    expect(sectoresDe(productos)).toEqual(["bebidas", "kiosco"]);
  });

  it("aplica el valor a todo el sector sin tocar otros", () => {
    const inicial = borradoresIniciales(productos);
    const out = borradoresDeSector(productos, inicial, "kiosco", { min: "8", reorder: "20" });
    expect(out.get("A-1")).toEqual({ min: "8", reorder: "20" });
    expect(out.get("C-3")).toEqual({ min: "8", reorder: "20" });
    expect(out.get("B-2")).toEqual({ min: "5", reorder: "12" });
    expect(inicial.get("A-1")).toEqual({ min: "", reorder: "" });
  });
});

describe("umbrales-panel: sugerido por rotación 7d", () => {
  it("sin venta no hay sugerido", () => {
    expect(sugeridoMinimo(0)).toBeNull();
    expect(sugeridoMinimo(null)).toBeNull();
    expect(sugeridoMinimo(undefined)).toBeNull();
  });

  it("redondea hacia arriba con piso 1", () => {
    expect(sugeridoMinimo(2)).toBe(2);
    expect(sugeridoMinimo(2.1)).toBe(3);
    expect(sugeridoMinimo(0.2)).toBe(1);
  });
});
