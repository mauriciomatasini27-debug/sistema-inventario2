import { describe, expect, it } from "vitest";
import { armarCobroDesdeCarrito, fusionarLinea, type LineaCarrito } from "../src/modules/sales/carrito_armar_cobro.js";
import { postSalesSchema } from "../src/lib/validation.js";

const CUANDO = "2026-01-01T12:00:00.000Z";

function cobrar(carrito: readonly LineaCarrito[]) {
  return armarCobroDesdeCarrito({
    carrito,
    medio: "Efectivo",
    device_code: "DEV",
    seq_local: 7,
    offline: true,
    occurredAtIso: CUANDO,
  });
}

describe("carrito de /venta arma el cobro", () => {
  it("manda las dos líneas del carrito en el payload", () => {
    const armado = cobrar([
      { product_id: "a", qty: 2, precio_centavos: 100 },
      { product_id: "b", qty: 1, precio_centavos: 500, alta: { nombre: "Nuevo" } },
    ]);
    expect(armado.ok).toBe(true);
    if (!armado.ok) return;
    expect(armado.payload.lineas).toHaveLength(2);
    expect(armado.payload.lineas[0]).toEqual({ product_id: "a", qty: 2, precio_centavos: 100 });
    expect(armado.payload.lineas[1]).toEqual({
      product_id: "b",
      qty: 1,
      precio_centavos: 500,
      alta: { nombre: "Nuevo" },
    });
    expect(armado.ticketBase.lineas).toHaveLength(2);
    expect(armado.ticketBase.total).toBe(String(2 * 100 + 500));
    expect(armado.ticketBase.provisorio).toBe("DEV-7");
    expect(armado.payload.offline).toBe(true);
    expect(armado.payload.seq_local).toBe(7);
    expect(armado.payload.client_occurred_at).toBe(CUANDO);
  });

  it("suma la cantidad del mismo SKU y conserva el primer precio y el alta existente", () => {
    const primera = fusionarLinea([], {
      product_id: "a",
      qty: 2,
      precio_centavos: 100,
      alta: { nombre: "Primero" },
    });
    expect(primera.ok).toBe(true);
    if (!primera.ok) return;
    const segunda = fusionarLinea(primera.carrito, {
      product_id: "a",
      qty: 3,
      precio_centavos: 999,
      alta: { nombre: "Segundo" },
    });
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.carrito).toEqual([
      { product_id: "a", qty: 5, precio_centavos: 100, alta: { nombre: "Primero" } },
    ]);
    const armado = cobrar(segunda.carrito);
    expect(armado.ok).toBe(true);
    if (!armado.ok) return;
    expect(armado.payload.lineas).toHaveLength(1);
    expect(armado.payload.lineas[0]?.qty).toBe(5);
    expect(armado.payload.lineas[0]?.precio_centavos).toBe(100);
  });

  it("si el primer scan no trae alta, el siguiente nombre queda en la línea", () => {
    const primera = fusionarLinea([], { product_id: "a", qty: 1, precio_centavos: 50 });
    expect(primera.ok).toBe(true);
    if (!primera.ok) return;
    const segunda = fusionarLinea(primera.carrito, {
      product_id: "a",
      qty: 1,
      precio_centavos: 80,
      alta: { nombre: "  Yerba  " },
    });
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.carrito[0]?.precio_centavos).toBe(50);
    expect(segunda.carrito[0]?.alta).toEqual({ nombre: "Yerba" });
  });

  it("rechaza la línea 51 y un carrito que ya trae 51", () => {
    const base = Array.from({ length: 50 }, (_, i) => ({
      product_id: "sku-" + i,
      qty: 1,
      precio_centavos: 10,
    }));
    expect(fusionarLinea(base, { product_id: "sku-50", qty: 1, precio_centavos: 10 })).toEqual({
      ok: false,
      codigo: "demasiadas_lineas",
    });
    expect(cobrar([...base, { product_id: "sku-50", qty: 1, precio_centavos: 10 }])).toEqual({
      ok: false,
      codigo: "demasiadas_lineas",
    });
  });

  it("#474: el payload de una línea por peso cumple el contrato y no pierde por_peso", () => {
    const armado = armarCobroDesdeCarrito({
      carrito: [{ product_id: "PAPAS", qty: 2500, precio_centavos: 5000, porPeso: true }],
      medio: "Efectivo",
      device_code: "caja-01",
      seq_local: 7,
      offline: true,
      occurredAtIso: CUANDO,
    });
    expect(armado.ok).toBe(true);
    if (!armado.ok) return;
    const parsed = postSalesSchema.safeParse(armado.payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.lineas[0]?.por_peso).toBe(true);
    expect(parsed.data.lineas[0]?.qty).toBe(2500);
  });

  it("rechaza sumar por encima de 999", () => {
    const primera = fusionarLinea([], { product_id: "a", qty: 900, precio_centavos: 1 });
    expect(primera.ok).toBe(true);
    if (!primera.ok) return;
    expect(fusionarLinea(primera.carrito, { product_id: "a", qty: 100, precio_centavos: 1 })).toEqual({
      ok: false,
      codigo: "qty_invalida",
    });
  });
});
