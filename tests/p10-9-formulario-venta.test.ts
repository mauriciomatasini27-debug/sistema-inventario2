import { describe, expect, it } from "vitest";
import {
  edicionDePayload,
  pagosSuman,
  payloadCorregido,
  totalCentavos,
} from "../src/lib/ventas-pendientes-form.js";
import type { EdicionVenta } from "../src/lib/ventas-pendientes-form.js";

describe("P10-9 formulario por línea de ventas pendientes", () => {
  it("arma un pago único por el total con el medio del payload cuando no hay pagos", () => {
    const payload = {
      lineas: [
        { product_id: "sku-1", qty: 2, precio_centavos: 1500 },
        { product_id: "sku-2", qty: 1, precio_centavos: 500 },
      ],
      medio: "Debito",
      device_code: "caja-01",
      seq_local: 7,
      client_occurred_at: "2026-10-22T10:00:00.000-03:00",
    };

    expect(edicionDePayload(payload)).toEqual({
      lineas: [
        { product_id: "sku-1", qty: 2, precio_centavos: 1500 },
        { product_id: "sku-2", qty: 1, precio_centavos: 500 },
      ],
      pagos: [{ medio: "Debito", monto_centavos: 3500 }],
    });
  });

  it("corrige solo qty, precio y pagos y conserva el resto del payload", () => {
    const payload = {
      lineas: [
        { product_id: "sku-1", qty: 2, precio_centavos: 1500, precio_id: "p-1", alta: { nombre: "Yerba" } },
        { product_id: "sku-2", qty: 1, precio_centavos: 500, precio_id: "p-2" },
      ],
      medio: "Mercado Pago",
      pagos: [{ medio: "Mercado Pago", monto_centavos: 3500 }],
      device_code: "caja-01",
      seq_local: 9,
      client_occurred_at: "2026-10-22T10:00:00.000-03:00",
      offline: true,
      fiscal_receptor_cuit: "20123456789",
      fiscal_cond_iva_receptor: 1,
      campo_desconocido: { a: 1 },
    };
    const edicion: EdicionVenta = {
      lineas: [
        { product_id: "sku-1", qty: 3, precio_centavos: 1400 },
        { product_id: "sku-2", qty: 1, precio_centavos: 500 },
      ],
      pagos: [
        { medio: "Efectivo", monto_centavos: 3500 },
        { medio: "Debito", monto_centavos: 1200 },
      ],
    };

    expect(payloadCorregido(payload, edicion)).toEqual({
      lineas: [
        { product_id: "sku-1", qty: 3, precio_centavos: 1400, precio_id: "p-1", alta: { nombre: "Yerba" } },
        { product_id: "sku-2", qty: 1, precio_centavos: 500, precio_id: "p-2" },
      ],
      medio: "Mercado Pago",
      pagos: [
        { medio: "Efectivo", monto_centavos: 3500 },
        { medio: "Debito", monto_centavos: 1200 },
      ],
      device_code: "caja-01",
      seq_local: 9,
      client_occurred_at: "2026-10-22T10:00:00.000-03:00",
      offline: true,
      fiscal_receptor_cuit: "20123456789",
      fiscal_cond_iva_receptor: 1,
      campo_desconocido: { a: 1 },
    });
  });

  it("calcula el total y si los pagos lo cubren", () => {
    const edicion: EdicionVenta = {
      lineas: [{ product_id: "sku-1", qty: 2, precio_centavos: 1500 }],
      pagos: [{ medio: "Efectivo", monto_centavos: 3000 }],
    };

    expect(totalCentavos(edicion.lineas)).toBe(3000);
    expect(pagosSuman(edicion)).toBe(true);
    expect(
      pagosSuman({ ...edicion, pagos: [{ medio: "Efectivo", monto_centavos: 2000 }] }),
    ).toBe(false);
    expect(pagosSuman({ ...edicion, pagos: [] })).toBe(false);
  });

  it("devuelve una edición vacía para un payload inválido sin lanzar", () => {
    expect(edicionDePayload(null)).toEqual({ lineas: [], pagos: [] });
    expect(edicionDePayload({ lineas: "x" })).toEqual({ lineas: [], pagos: [] });
    expect(() => edicionDePayload(null)).not.toThrow();
    expect(payloadCorregido("no es objeto", { lineas: [], pagos: [] })).toEqual({});
  });
});
