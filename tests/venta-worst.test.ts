import { describe, expect, it } from "vitest";
import { MEDIOS_VENTA, VENTA_WORST, type VentaWorstFixture, modoHarness } from "../src/lib/venta-worst.js";
import { postSalesSchema } from "../src/lib/validation.js";

const RTL = /[\u0590-\u05FF\u0600-\u06FF]/;
const EMOJI = /\p{Extended_Pictographic}/u;

function payloadDelPeor(f: VentaWorstFixture) {
  return {
    lineas: f.lineas.map((l) => ({ product_id: l.sku, qty: l.qty, precio_centavos: l.precioCentavos })),
    medio: f.medio,
    device_code: "caja-recepcion-01",
    seq_local: 1,
    client_occurred_at: "2026-10-17T12:00:00.000-03:00",
    offline: true,
  };
}

describe("venta-worst: peor caso con la forma del contrato", () => {
  it("usa los 5 medios de la lista cerrada", () => {
    expect(MEDIOS_VENTA).toHaveLength(5);
    expect([...VENTA_WORST.medios]).toEqual([...MEDIOS_VENTA]);
    expect(Object.keys(VENTA_WORST.balance.por_medio).sort()).toEqual([...MEDIOS_VENTA].sort());
  });

  it("los textos del peor caso superan 80 caracteres", () => {
    expect(VENTA_WORST.sku.length).toBeGreaterThanOrEqual(80);
    expect(VENTA_WORST.nombre.length).toBeGreaterThanOrEqual(80);
    expect(VENTA_WORST.errorApi.length).toBeGreaterThanOrEqual(80);
    expect(VENTA_WORST.errorSync.length).toBeGreaterThanOrEqual(80);
  });

  it("incluye un SKU largo sin espacios que no puede partirse por palabra", () => {
    expect(VENTA_WORST.sku).not.toMatch(/\s/);
    expect(VENTA_WORST.sku.length).toBeGreaterThanOrEqual(80);
  });

  it("lleva montos y cantidades al máximo del schema", () => {
    expect(VENTA_WORST.precioCentavos).toBe(999_999_999);
    expect(VENTA_WORST.qty).toBe(999);
  });

  it("incluye nombre RTL y nombre con emoji", () => {
    expect(VENTA_WORST.rtlNombre).toMatch(RTL);
    expect(VENTA_WORST.emojiNombre).toMatch(EMOJI);
  });

  it("encola 50 provisorios offline", () => {
    expect(VENTA_WORST.cola).toHaveLength(50);
    for (const op of VENTA_WORST.cola) {
      expect(op.payload.offline).toBe(true);
      expect(op.op_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("el SKU del peor caso excede el máximo de product_id del schema", () => {
    const parsed = postSalesSchema.safeParse(payloadDelPeor(VENTA_WORST));
    expect(parsed.success).toBe(false);
    expect(VENTA_WORST.sku.length).toBeGreaterThan(64);
  });

  it("los montos al máximo pasan el schema con un SKU en contrato", () => {
    const payload = payloadDelPeor(VENTA_WORST);
    payload.lineas = payload.lineas.map((l) => ({ ...l, product_id: "demo-sku-1" }));
    const parsed = postSalesSchema.safeParse(payload);
    expect(parsed.success, JSON.stringify(parsed.error?.flatten())).toBe(true);
  });
});

describe("modoHarness: toggle solo en dev", () => {
  const url = (q: string) => new URL("http://localhost:4321/venta" + q);

  it("en dev reconoce data=worst", () => {
    expect(modoHarness(url("?data=worst"), true)).toEqual({ data: "worst", dir: "ltr" });
  });

  it("en dev reconoce dir=rtl", () => {
    expect(modoHarness(url("?dir=rtl"), true)).toEqual({ data: null, dir: "rtl" });
  });

  it("en dev sin params queda en neutro", () => {
    expect(modoHarness(url(""), true)).toEqual({ data: null, dir: "ltr" });
  });

  it("en dev ignora valores desconocidos", () => {
    expect(modoHarness(url("?data=demo&dir=ltr"), true)).toEqual({ data: null, dir: "ltr" });
  });

  it("en producción siempre null y ltr aunque la URL traiga los params", () => {
    expect(modoHarness(url("?data=worst&dir=rtl"), false)).toEqual({ data: null, dir: "ltr" });
  });
});
