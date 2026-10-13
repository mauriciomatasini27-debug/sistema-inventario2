import { beforeEach, describe, expect, it } from "vitest";
import { leerFiscalDocs, persistirFiscalDoc } from "../src/lib/fiscal-db.js";
import { POST as POSTSales } from "../src/pages/api/sales.js";
import { GET as GETHistory } from "../src/pages/api/fiscal/history.js";
import { resetStore } from "../src/lib/store.js";

beforeEach(() => {
  resetStore();
  delete process.env.TENANT_DATABASE_URL;
});

describe("fiscal durable PERS-S4 (sin DB no rompe)", () => {
  it("helper resuelve false/null sin env", async () => {
    await expect(
      persistirFiscalDoc({
        id: crypto.randomUUID(),
        idempotency_key: "k",
        sale_id: crypto.randomUUID(),
        cbte_tipo: "11",
        pto_vta: "3",
        cbte_nro: null,
        cbte_fch: "20261012",
        doc_tipo: "99",
        doc_nro: "0",
        cond_iva_receptor: "5",
        estado: "pendiente",
        cae: null,
        cae_vto: null,
        qr_payload: null,
      }),
    ).resolves.toBe(false);
    await expect(leerFiscalDocs()).resolves.toBeNull();
  });

  it("venta crea doc fiscal y el historial lo sirve desde memoria", async () => {
    const r = (await POSTSales({
      request: new Request("http://x/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
          medio: "Efectivo",
          device_code: "caja-01",
          seq_local: 1,
          client_occurred_at: new Date().toISOString(),
          offline: false,
        }),
      }),
    } as never)) as Response;
    expect(r.status).toBe(201);
    const h = (await GETHistory({ url: new URL("http://x/api/fiscal/history") } as never)) as Response;
    expect(h.status).toBe(200);
    const j = (await h.json()) as { docs: unknown[] };
    expect(j.docs.length).toBeGreaterThanOrEqual(1);
  });
});
