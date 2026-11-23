import { describe, expect, it } from "vitest";
import { postSalesSchema } from "../src/lib/validation.js";
import { payloadCorregido, type BorradorVenta } from "../src/lib/ventas-pendientes-form.js";

const payload = {
  lineas: [{ product_id: "sku-1", qty: 2, precio_centavos: 1500, precio_id: "p-1" }],
  medio: "Efectivo",
  device_code: "caja-01",
  seq_local: 7,
  client_occurred_at: "2026-01-01T12:00:00.000Z",
  offline: false,
};

describe("#475 venta-2: precio_id sale del contrato de venta", () => {
  it("lo descarta al parsear y un payload viejo sigue entrando", () => {
    const parsed = postSalesSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.lineas[0]).not.toHaveProperty("precio_id");
  });

  it("el formulario de corrección sigue conservando los campos desconocidos de la línea original", () => {
    const borrador: BorradorVenta = {
      lineas: [
        {
          id: "l1",
          origen: 0,
          product_id: "sku-1",
          nombre: null,
          qtyTexto: "3",
          precioTexto: "15,00",
        },
      ],
      pagos: [],
      sinPagos: true,
      medio: "Efectivo",
    };
    const corregido = payloadCorregido(payload, borrador);
    const lineas = corregido["lineas"] as Array<Record<string, unknown>>;
    expect(lineas[0]).toMatchObject({ precio_id: "p-1", qty: 3 });
  });
});
