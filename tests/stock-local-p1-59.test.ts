import { describe, expect, it } from "vitest";
import type { SnapshotCatalogoLocal } from "../src/offline/catalogo-local.js";
import type { ItemCola } from "../src/offline/cola-venta.js";
import { avisoStockLocalAgotado, stockLocal } from "../src/offline/stock-local.js";

function snapshot(stock: number, sku = "yerba-1"): SnapshotCatalogoLocal {
  return {
    version: 2,
    descargadoEl: "2026-11-06T12:00:00.000Z",
    productos: { [sku]: { stock, precioCentavos: 1000 } },
    codigos: {},
  };
}

function item(op_id: string, payload: unknown): ItemCola {
  return { op_id, device_code: "D1", device_seq: 1, payload };
}

function venta(qty: number, sku = "yerba-1"): unknown {
  return { lineas: [{ product_id: sku, qty, precio_centavos: 1000 }] };
}

describe("P1-59 stock local proyectado", () => {
  it("con la cola vacía devuelve el stock del snapshot", () => {
    expect(stockLocal(snapshot(4), [], "yerba-1")).toBe(4);
  });

  it("resta la cantidad de una venta pendiente y no toca el snapshot", () => {
    const snap = snapshot(5);
    expect(stockLocal(snap, [item("op-1", venta(2))], "yerba-1")).toBe(3);
    expect(snap.productos["yerba-1"]?.stock).toBe(5);
  });

  it("resta cada cobro distinto", () => {
    const cola = [item("op-1", venta(1)), item("op-2", venta(2))];
    expect(stockLocal(snapshot(5), cola, "yerba-1")).toBe(2);
  });

  it("cuenta una sola vez el mismo op_id", () => {
    const cola = [item("op-1", venta(2)), item("op-1", venta(9))];
    expect(stockLocal(snapshot(5), cola, "yerba-1")).toBe(3);
  });

  it("ignora un payload sin líneas legibles", () => {
    const cola = [
      item("op-1", null),
      item("op-2", {}),
      item("op-3", { lineas: "no" }),
      item("op-4", { lineas: [{ product_id: "yerba-1", qty: 1.5 }] }),
      item("op-5", { lineas: [{ product_id: "yerba-1", qty: "2" }] }),
      item("op-6", { lineas: [{ qty: 2 }] }),
    ];
    expect(stockLocal(snapshot(5), cola, "yerba-1")).toBe(5);
  });

  it("resta solo la línea legible cuando el mismo cobro trae basura", () => {
    const cola = [
      item("op-1", {
        lineas: [
          { product_id: "yerba-1", qty: "2" },
          { product_id: "yerba-1", qty: 2, precio_centavos: 1000 },
        ],
      }),
    ];
    expect(stockLocal(snapshot(5), cola, "yerba-1")).toBe(3);
  });

  it("puede quedar negativo", () => {
    expect(stockLocal(snapshot(1), [item("op-1", venta(3))], "yerba-1")).toBe(-2);
  });

  it("resta también la cantidad que todavía está en el carrito", () => {
    expect(stockLocal(snapshot(5), [item("op-1", venta(2))], "yerba-1", 1)).toBe(2);
    expect(stockLocal(snapshot(5), [], "yerba-1", 2)).toBe(3);
  });

  it("no resta un carrito que no es un entero positivo", () => {
    expect(stockLocal(snapshot(5), [], "yerba-1", 0)).toBe(5);
    expect(stockLocal(snapshot(5), [], "yerba-1", -3)).toBe(5);
    expect(stockLocal(snapshot(5), [], "yerba-1", 1.5)).toBe(5);
  });

  it("devuelve null si el SKU no está en el snapshot", () => {
    expect(stockLocal(snapshot(5), [item("op-1", venta(1))], "otro")).toBeNull();
    expect(stockLocal(null, [item("op-1", venta(1))], "yerba-1")).toBeNull();
  });

  it("no descuenta un SKU que la venta no tocó", () => {
    const snap = snapshot(5);
    snap.productos["azucar-1"] = { stock: 4, precioCentavos: 800 };
    expect(stockLocal(snap, [item("op-1", venta(2))], "azucar-1")).toBe(4);
  });
});

describe("avisoStockLocalAgotado", () => {
  it("avisa en 0 y en negativo, y calla si queda stock o no hay proyección", () => {
    expect(avisoStockLocalAgotado(0)).toBe(true);
    expect(avisoStockLocalAgotado(-2)).toBe(true);
    expect(avisoStockLocalAgotado(1)).toBe(false);
    expect(avisoStockLocalAgotado(null)).toBe(false);
    expect(avisoStockLocalAgotado(stockLocal(snapshot(1), [item("op-1", venta(1))], "yerba-1"))).toBe(true);
    expect(avisoStockLocalAgotado(stockLocal(null, [], "yerba-1"))).toBe(false);
  });
});
