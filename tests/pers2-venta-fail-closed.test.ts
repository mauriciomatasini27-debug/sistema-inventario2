import { afterEach, describe, expect, it } from "vitest";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { ctx } from "./helpers/ctx.js";

const vars = ["TENANT_MODE", "TENANT_DATABASE_URL_tenant-a"] as const;
const previas = new Map<string, string | undefined>();

function fijarMultiDbCaida() {
  for (const key of vars) {
    if (!previas.has(key)) previas.set(key, process.env[key]);
  }
  process.env.TENANT_MODE = "multi";
  // La URL está configurada, pero no hay un servidor escuchando en ese puerto.
  // Así se ejercita el catch de una consulta fallida, no solo el caso sin env.
  process.env.TENANT_DATABASE_URL_tenant-a =
    "postgres://postgres:postgres@127.0.0.1:1/pers_test?connect_timeout=1";
}

afterEach(() => {
  for (const key of vars) {
    const value = previas.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  previas.clear();
  resetStore();
});

describe("registro de venta fail-closed en modo multi", () => {
  it("responde 503 y no escribe en memoria si PostgreSQL del tenant está caído", async () => {
    fijarMultiDbCaida();
    resetStore();
    const antes = await conTenant("tenant-a", () => store.idempotency.size);

    const response = (await conTenant("tenant-a", () =>
      postSales(
        ctx("http://x/api/sales", {
          method: "POST",
          headers: { "Idempotency-Key": "test-multi-db-caida" },
          body: {
            lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
            medio: "Efectivo",
            device_code: "test-device",
            seq_local: 1,
            client_occurred_at: new Date().toISOString(),
            offline: false,
          },
        }),
      ),
    )) as Response;

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "base_no_disponible" });

    await conTenant("tenant-a", () => {
      expect(store.idempotency.size).toBe(antes);
      expect(store.movements).toHaveLength(0);
      expect(store.stock.get("demo-sku-1")).toBe(10);
    });
  });
});
