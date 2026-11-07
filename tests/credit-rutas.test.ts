import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { POST as POSTPay } from "../src/pages/api/credit/payments.js";
import { POST as POSTSale } from "../src/pages/api/credit/sales-on-account.js";
import { GET as GETBalance } from "../src/pages/api/credit/balance.js";
import { resetStore, store } from "../src/lib/store.js";

function req(url: string, key: string, body: unknown) {
  return ctx(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: body as Record<string, unknown>,
  });
}

describe("credit rutas PERS-S4 (sin DB no rompe)", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.TENANT_DATABASE_URL;
  });

  it("sin base la venta a cuenta no fía aunque el body traiga tope", async () => {
    const key = crypto.randomUUID();
    const id = crypto.randomUUID();
    const cuerpo = {
      customer_id: id,
      lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 20000 }],
      device_code: "caja-01",
      seq_local: 1,
      tope_centavos: 999_999_999,
      saldo_actual_centavos: 0,
    };
    const r = (await POSTSale(req("http://localhost/api/credit/sales-on-account", key, cuerpo))) as Response;
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: "CLIENTE_DESCONOCIDO" });
    const dup = (await POSTSale(req("http://localhost/api/credit/sales-on-account", key, cuerpo))) as Response;
    expect(dup.status).toBe(404);
    const b = (await GETBalance(ctx(`http://x/api/credit/balance?customer_id=${id}`))) as Response;
    const j = (await b.json()) as Record<string, unknown>;
    expect(j["saldo_centavos"]).toBe("0");
    expect(j["fuente"]).toBe("memoria");
  });

  it("cobro 201 resta haber y balance cuadra", async () => {
    store.creditMovs.push({ customer_id: "cli-2", debe: "20000", haber: "0", key: "semilla-cli-2", fecha_ms: Date.now() });
    const k2 = crypto.randomUUID();
    const r = (await POSTPay(
      req("http://localhost/api/credit/payments", k2, { customer_id: "cli-2", monto_centavos: 8000, medio: "Efectivo" }),
    )) as Response;
    expect(r.status).toBe(201);
    const b = (await GETBalance(ctx("http://x/api/credit/balance?customer_id=cli-2"))) as Response;
    const j = (await b.json()) as Record<string, unknown>;
    expect(j["saldo_centavos"]).toBe("12000");
    expect(j["estado"]).toBe("al_dia");
  });
});
