import { describe, expect, it } from "vitest";
import { confirmar_venta, type ConfirmarVentaOk } from "../src/modules/sales/confirmar_venta.js";
import { derivar_balance } from "../src/modules/cash/caja.js";

function base(over: Partial<Parameters<typeof confirmar_venta>[0]> = {}) {
  return {
    idempotencyKey: "k-" + Math.random().toString(36).slice(2),
    lineas: [{ product_id: "p1", qty: 1, precio_centavos: 15000n }],
    medio: "Efectivo" as const,
    device_code: "caja-01",
    seq_local: 1,
    offline: false,
    stockDisponible: new Map([["p1", 10]]),
    vistos: new Map<string, ConfirmarVentaOk>(),
    proximoDefinitivo: () => "T-000001",
    clientOccurredAt: new Date().toISOString(),
    ...over,
  };
}

describe("slice-0 venta mostrador", () => {
  it("doble toque con mismo Idempotency-Key devuelve 409 sin duplicar", () => {
    const vistos = new Map<string, ConfirmarVentaOk>();
    const input = base({ idempotencyKey: "doble-1", vistos });
    const r1 = confirmar_venta(input);
    expect(r1.status).toBe(201);
    const r2 = confirmar_venta(base({ idempotencyKey: "doble-1", vistos }));
    expect(r2.status).toBe(409);
    expect(vistos.size).toBe(1);
  });

  it("balance cuadra con SUM por medio", () => {
    const v1 = confirmar_venta(base({ idempotencyKey: "b1", medio: "Efectivo" }));
    const v2 = confirmar_venta(
      base({ idempotencyKey: "b2", medio: "QR", lineas: [{ product_id: "p1", qty: 2, precio_centavos: 5000n }] }),
    );
    expect(v1.status).toBe(201);
    expect(v2.status).toBe(201);
    const movs = [v1, v2].flatMap((r) =>
      r.status === 201
        ? [{ tipo: "egreso" as const, metodo: r.ticket.egreso.metodo, monto_centavos: r.ticket.total_centavos, origen: "venta" as const }]
        : [],
    );
    const b = derivar_balance(movs);
    expect(b.porMedio["Efectivo"]).toBe(-15000n);
    expect(b.porMedio["QR"]).toBe(-10000n);
    expect(b.total).toBe(-25000n);
  });

  it("sobreventa offline se acepta marcada, online se rechaza 422", () => {
    const stock = new Map([["p1", 1]]);
    const off = confirmar_venta(
      base({ idempotencyKey: "off-1", offline: true, stockDisponible: stock, lineas: [{ product_id: "p1", qty: 5, precio_centavos: 1000n }] }),
    );
    expect(off.status).toBe(201);
    if (off.status === 201) {
      expect(off.ticket.sobreventa).toBe(true);
      expect(off.ticket.ticket_definitivo).toBeNull();
    }
    const on = confirmar_venta(
      base({ idempotencyKey: "on-1", offline: false, stockDisponible: new Map([["p1", 1]]), lineas: [{ product_id: "p1", qty: 5, precio_centavos: 1000n }] }),
    );
    expect(on.status).toBe(422);
  });
});
