import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import { POST as postProducts } from "../src/pages/api/products.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { POST as postCuenta } from "../src/pages/api/credit/sales-on-account.js";
import { aplicarVentaOutbox } from "../src/modules/sync/aplicar-venta-outbox.js";
import { convertirKgAGramos, MAX_GRAMOS } from "../src/modules/sales/linea_peso.js";

function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

async function sembrar(sku: string, precioCentavos: number, porPeso: boolean, stock: number): Promise<void> {
  const r = (await postProducts(
    ctx("http://x/api/products", {
      body: { sku, nombre: "Papas", precio_centavos: precioCentavos, por_peso: porPeso },
    }),
  )) as Response;
  expect(r.status).toBe(201);
  store.stock.set(sku, stock);
}

async function vender(body: Record<string, unknown>) {
  const r = (await postSales(
    ctx("http://localhost/api/sales", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: {
        medio: "Efectivo",
        device_code: "caja-01",
        seq_local: 7,
        client_occurred_at: new Date().toISOString(),
        offline: false,
        ...body,
      },
    }),
  )) as Response;
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

describe("fixes code review venta por peso", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("un por_peso:true falso en el body no vuelve por peso una línea de unidades", async () => {
    await sembrar("REV-UNIDAD", 1500, false, 10);
    const r = await vender({
      lineas: [{ product_id: "REV-UNIDAD", qty: 2, precio_centavos: 1500, por_peso: true }],
    });
    expect(r.status).toBe(201);
    expect(r.json["total_centavos"]).toBe("3000");
    expect(store.stock.get("REV-UNIDAD")).toBe(8);
  });

  it("un por_peso:false falso en el body no vuelve por unidades una línea por peso", async () => {
    await sembrar("REV-PESO", 500000, true, 5000);
    const r = await vender({
      lineas: [{ product_id: "REV-PESO", qty: 500, precio_centavos: 500000, por_peso: false }],
    });
    expect(r.status).toBe(201);
    expect(r.json["total_centavos"]).toBe("250000");
    expect(store.stock.get("REV-PESO")).toBe(4500);
  });

  it("el replay offline ignora por_peso del payload y resuelve desde el catálogo", async () => {
    await sembrar("REV-OFF", 1500, false, 10);
    const r = await aplicarVentaOutbox({
      opId: crypto.randomUUID(),
      payload: {
        lineas: [{ product_id: "REV-OFF", qty: 2, precio_centavos: 1500, por_peso: true }],
        medio: "Efectivo",
        device_code: "caja-01",
        seq_local: 7,
        client_occurred_at: new Date().toISOString(),
        offline: true,
      },
    });
    expect(r).toMatchObject({ resultado: "aplicada" });
    expect(store.stock.get("REV-OFF")).toBe(8);
    expect(store.movements.at(-1)?.monto_centavos).toBe("3000");
  });

  it("una venta a cuenta por peso se rechaza con 422 y mensaje de dominio", async () => {
    const r = (await postCuenta(
      ctx("http://x/api/credit/sales-on-account", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: {
          customer_id: crypto.randomUUID(),
          lineas: [{ product_id: "REV-FIADO", qty: 500, precio_centavos: 500000, por_peso: true }],
          device_code: "caja-01",
          seq_local: 7,
        },
      }),
    )) as Response;
    expect(r.status).toBe(422);
    const j = (await r.json()) as { error: string; codigo: string };
    expect(j.error).toMatch(/por peso/i);
    expect(j.codigo).toBe("VENTA_A_CUENTA_POR_PESO_NO_DISPONIBLE");
  });

  it("1000 kg es válido y cualquier peso mayor se rechaza", () => {
    expect(MAX_GRAMOS).toBe(1_000_000);
    expect(convertirKgAGramos("1000,000")).toEqual({ ok: true, gramos: 1_000_000 });
    expect(convertirKgAGramos("1.000,000")).toEqual({ ok: true, gramos: 1_000_000 });
    expect(convertirKgAGramos("1000,001")).toEqual({ ok: false, motivo: "excede_maximo" });
    expect(convertirKgAGramos("1001")).toEqual({ ok: false, motivo: "excede_maximo" });
  });
});
