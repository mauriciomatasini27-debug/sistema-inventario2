import { beforeEach, describe, expect, it } from "vitest";
import { POST as POSTSales } from "../src/pages/api/sales.js";
import { POST as POSTCash } from "../src/pages/api/cash/movements.js";
import { resetStore, store } from "../src/lib/store.js";

function ventaBody(seq: number) {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: seq,
    client_occurred_at: new Date().toISOString(),
    offline: false,
  };
}

function req(url: string, key: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

describe("persistencia write-through PERS-S1 (sin DB no rompe)", () => {
  beforeEach(() => resetStore());

  it("venta 201 + 409 replay con write-through best-effort activo", async () => {
    const key = crypto.randomUUID();
    const r1 = (await POSTSales({ request: req("http://localhost/api/sales", key, ventaBody(1)) } as never)) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1["ticket_definitivo"]).toBe("T-000001");
    expect(store.idempotency.get(key)?.sale_id).toBe(j1["sale_id"]);

    const r2 = (await POSTSales({ request: req("http://localhost/api/sales", key, ventaBody(1)) } as never)) as Response;
    expect(r2.status).toBe(409);
    expect(store.movements.filter((m) => m.idempotency_key === key)).toHaveLength(1);
  });

  it("cash standalone 201 + 409 duplicado con write-through activo", async () => {
    const key = crypto.randomUUID();
    const body = {
      tipo: "egreso",
      metodo: "Efectivo",
      categoria_id: "retiro_otro",
      origen: "retiro",
      monto_centavos: 5000,
      device_code: "caja-01",
      seq_local: 1,
      client_occurred_at: new Date().toISOString(),
    };
    const r1 = (await POSTCash({ request: req("http://localhost/api/cash/movements", key, body) } as never)) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTCash({ request: req("http://localhost/api/cash/movements", key, body) } as never)) as Response;
    expect(r2.status).toBe(409);
  });
});
