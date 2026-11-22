import { describe, expect, it } from "vitest";
import {
  MAX_GRAMOS,
  convertirKgAGramos,
  descripcionLineaPeso,
  esCantidadValida,
  formatearKilogramos,
  mensajeErrorPeso,
  subtotalPorPeso,
} from "../src/modules/sales/linea_peso.js";
import { armarCobroDesdeCarrito, fusionarLinea, type LineaCarrito } from "../src/modules/sales/carrito_armar_cobro.js";
import { vender_mostrador, type TicketEmitido, type VenderMostradorInput } from "../src/modules/sales/vender_mostrador.js";
import type { Lote, LotId, Sku } from "../src/modules/inventario/inventario.js";

const sku = (s: string) => s as Sku;
const lot = (s: string) => s as LotId;
const lote = (id: string, s: string, cantidad: number): Lote => ({
  id: lot(id),
  sku: sku(s),
  cantidad,
  venceEl: null,
  costoCentavos: 1000n,
});

const CUANDO = "2026-11-21T12:00:00.000-03:00";

describe("T2 #386 carga en kilogramos: conversión exacta y validación de campo", () => {
  it("1,250 kg son 1250 gramos; 375 g y 1 kg conversiones exactas", () => {
    expect(convertirKgAGramos("1,250")).toEqual({ ok: true, gramos: 1250 });
    expect(convertirKgAGramos("0,375")).toEqual({ ok: true, gramos: 375 });
    expect(convertirKgAGramos("1")).toEqual({ ok: true, gramos: 1000 });
    expect(convertirKgAGramos("1.500")).toEqual({ ok: true, gramos: 1500 });
    expect(convertirKgAGramos("1.250,500")).toEqual({ ok: false, motivo: "excede_maximo" });
  });

  it("vacío, cero, negativo y más de tres decimales dan error de campo", () => {
    expect(convertirKgAGramos("")).toEqual({ ok: false, motivo: "vacio" });
    expect(convertirKgAGramos("0")).toEqual({ ok: false, motivo: "cero" });
    expect(convertirKgAGramos("-1")).toEqual({ ok: false, motivo: "negativo" });
    expect(convertirKgAGramos("1,2500")).toEqual({ ok: false, motivo: "decimales" });
    expect(convertirKgAGramos("papas")).toEqual({ ok: false, motivo: "invalido" });
  });

  it("por encima del máximo configurable se rechaza y el mensaje nombra el peso", () => {
    const resultado = convertirKgAGramos(String(MAX_GRAMOS / 1000 + 1));
    expect(resultado).toEqual({ ok: false, motivo: "excede_maximo" });
    expect(mensajeErrorPeso("excede_maximo")).toMatch(/kg|peso|máximo/i);
    expect(mensajeErrorPeso("decimales")).toMatch(/3|tres/i);
  });

  it("la cantidad válida se ramifica: unidades 1..999, gramos 1..MAX_GRAMOS", () => {
    expect(esCantidadValida(999, false)).toBe(true);
    expect(esCantidadValida(1000, false)).toBe(false);
    expect(esCantidadValida(1, true)).toBe(true);
    expect(esCantidadValida(1250, true)).toBe(true);
    expect(esCantidadValida(MAX_GRAMOS, true)).toBe(true);
    expect(esCantidadValida(MAX_GRAMOS + 1, true)).toBe(false);
    expect(esCantidadValida(0, true)).toBe(false);
  });
});

describe("T2 #386 subtotal por peso con aritmética entera", () => {
  it("1250 g a 5000 centavos por kg dan 6250 centavos", () => {
    expect(subtotalPorPeso(1250, 5000)).toBe(6250n);
  });

  it("1 gramo a 500 centavos por kg redondea mitad arriba a 1 centavo", () => {
    expect(subtotalPorPeso(1, 500)).toBe(1n);
  });

  it("la mitad justa sube y por debajo de la mitad baja", () => {
    expect(subtotalPorPeso(1, 499)).toBe(0n);
    expect(subtotalPorPeso(1, 501)).toBe(1n);
  });

  it("el ticket muestra kilogramos con tres decimales y la cuenta completa", () => {
    expect(formatearKilogramos(1250)).toBe("1,250");
    expect(formatearKilogramos(375)).toBe("0,375");
    expect(descripcionLineaPeso(1250, 500000)).toContain("1,250 kg");
    expect(descripcionLineaPeso(1250, 500000)).toContain("/kg");
    expect(descripcionLineaPeso(1250, 500000)).toContain("$ 6.250,00");
  });
});

describe("T2 #386 carrito: gramos por línea y total mixto", () => {
  const cobrar = (carrito: readonly LineaCarrito[]) =>
    armarCobroDesdeCarrito({
      carrito,
      medio: "Efectivo",
      device_code: "DEV",
      seq_local: 7,
      offline: true,
      occurredAtIso: CUANDO,
    });

  it("una línea por peso viaja en gramos y el total usa centavos por kg", () => {
    const armado = cobrar([{ product_id: "PAPAS", qty: 1250, precio_centavos: 5000, porPeso: true }]);
    expect(armado.ok).toBe(true);
    if (!armado.ok) return;
    expect(armado.payload.lineas[0]).toEqual({ product_id: "PAPAS", qty: 1250, precio_centavos: 5000, porPeso: true });
    expect(armado.ticketBase.total).toBe("6250");
    expect(armado.ticketBase.lineas[0]).toMatchObject({ porPeso: true, subtotal: "6250" });
    expect(armado.ticketBase.lineas[0]?.descripcion).toContain("1,250 kg");
  });

  it("mezcla unidades y kilogramos en la misma venta", () => {
    const armado = cobrar([
      { product_id: "YERBA", qty: 2, precio_centavos: 15000 },
      { product_id: "PAPAS", qty: 1250, precio_centavos: 5000, porPeso: true },
    ]);
    expect(armado.ok).toBe(true);
    if (!armado.ok) return;
    expect(armado.ticketBase.total).toBe(String(30000 + 6250));
  });

  it("rechaza gramos fuera de rango y no deja mezclar unidades con peso en un SKU", () => {
    expect(fusionarLinea([], { product_id: "PAPAS", qty: MAX_GRAMOS + 1, precio_centavos: 5000, porPeso: true })).toEqual({
      ok: false,
      codigo: "qty_invalida",
    });
    const primera = fusionarLinea([], { product_id: "PAPAS", qty: 1000, precio_centavos: 5000, porPeso: true });
    expect(primera.ok).toBe(true);
    if (!primera.ok) return;
    expect(fusionarLinea(primera.carrito, { product_id: "PAPAS", qty: 1, precio_centavos: 5000 })).toEqual({
      ok: false,
      codigo: "qty_invalida",
    });
  });

  it("suma gramos del mismo SKU por peso sin tope de 999", () => {
    const primera = fusionarLinea([], { product_id: "PAPAS", qty: 900, precio_centavos: 100, porPeso: true });
    expect(primera.ok).toBe(true);
    if (!primera.ok) return;
    const segunda = fusionarLinea(primera.carrito, { product_id: "PAPAS", qty: 350, precio_centavos: 100, porPeso: true });
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.carrito[0]?.qty).toBe(1250);
  });
});

describe("T2 #386 vender_mostrador: total por peso, 1 gramo y stock en gramos", () => {
  function base(over: Partial<VenderMostradorInput> = {}): VenderMostradorInput {
    return {
      idempotencyKey: "k-" + Math.random().toString(36).slice(2),
      lineas: [{ sku: sku("PAPAS"), cantidad: 1250, precioCentavos: 5000n, porPeso: true }],
      medio: "Efectivo",
      deviceCode: "KIOSCO-01",
      seqLocal: 41,
      offline: false,
      lotes: [lote("l1", "PAPAS", 5000)],
      vistos: new Map<string, TicketEmitido>(),
      ultimoDefinitivo: { n: 128 },
      grant: { rol: "dueno" },
      ...over,
    };
  }

  it("descuenta los gramos de un solo lote y totaliza 6250 centavos", () => {
    const r = vender_mostrador(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.descuentos.map((d) => ({ sku: d.sku, cantidad: d.cantidad }))).toEqual([
      { sku: "PAPAS", cantidad: 1250 },
    ]);
    expect(r.efecto.movimientosStock).toHaveLength(1);
    expect(r.efecto.egreso).toMatchObject({ monto_centavos: 6250n });
  });

  it("acepta 1 gramo con redondeo mitad arriba y rechaza 0 gramos", () => {
    const uno = vender_mostrador(
      base({
        lineas: [{ sku: sku("PAPAS"), cantidad: 1, precioCentavos: 500n, porPeso: true }],
        lotes: [lote("l1", "PAPAS", 5000)],
      }),
    );
    expect(uno.ok).toBe(true);
    if (uno.ok) expect(uno.efecto.egreso.monto_centavos).toBe(1n);

    expect(
      vender_mostrador(base({ lineas: [{ sku: sku("PAPAS"), cantidad: 0, precioCentavos: 500n, porPeso: true }] })),
    ).toMatchObject({ ok: false, codigo: "LINEA_INVALIDA", status: 422 });
  });

  it("mezcla unidades y kilogramos en un mismo ticket", () => {
    const r = vender_mostrador(
      base({
        lineas: [
          { sku: sku("YERBA"), cantidad: 2, precioCentavos: 15000n },
          { sku: sku("PAPAS"), cantidad: 1250, precioCentavos: 5000n, porPeso: true },
        ],
        lotes: [lote("y1", "YERBA", 10), lote("p1", "PAPAS", 5000)],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.efecto.egreso.monto_centavos).toBe(36250n);
  });

  it("sin stock suficiente en gramos falla SIN_STOCK sin efectos", () => {
    const r = vender_mostrador(base({ lotes: [lote("l1", "PAPAS", 1000)] }));
    expect(r).toMatchObject({ ok: false, codigo: "SIN_STOCK", status: 422 });
  });

  it("acepta gramos por encima del tope de 999 unidades", () => {
    const r = vender_mostrador(
      base({
        lineas: [{ sku: sku("PAPAS"), cantidad: 1000, precioCentavos: 5000n, porPeso: true }],
        lotes: [lote("l1", "PAPAS", 5000)],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.efecto.egreso.monto_centavos).toBe(5000n);
  });
});
