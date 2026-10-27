import { afterEach, describe, expect, it } from "vitest";
import { BaseNoDisponible } from "../src/lib/server-db.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";

const vars = ["TENANT_MODE", "TENANT_DATABASE_URL_tenant-a"] as const;
const previas = new Map<string, string | undefined>();

function fijarMultiSinBase() {
  for (const key of vars) {
    if (!previas.has(key)) previas.set(key, process.env[key]);
  }
  process.env.TENANT_MODE = "multi";
  delete process.env.TENANT_DATABASE_URL_tenant-a;
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
  it("no confirma ni escribe en memoria si falta la base del tenant", async () => {
    fijarMultiSinBase();
    resetStore();
    const antes = store.idempotency.size;

    await expect(
      conTenant("tenant-a", () =>
        registrar_venta({
          key: "test-multi-sin-base",
          lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
          medio: "Efectivo",
          deviceCode: "test-device",
          seqLocal: 1,
          offline: false,
        }),
      ),
    ).rejects.toBeInstanceOf(BaseNoDisponible);

    await conTenant("tenant-a", () => {
      expect(store.idempotency.size).toBe(antes);
      expect(store.movements).toHaveLength(0);
      expect(store.stock.get("demo-sku-1")).toBe(10);
    });
  });
});
