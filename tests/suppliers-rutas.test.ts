import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { POST as POSTSupplier } from "../src/pages/api/suppliers.js";
import { POST as POSTOrder } from "../src/pages/api/purchase-orders.js";
import { resetStore } from "../src/lib/store.js";

const CUIT = "20-93333172-6";

beforeEach(() => {
  resetStore();
  delete process.env.TENANT_DATABASE_URL;
});

function req(url: string, key: string | null, body: unknown) {
  return ctx(url, {
    method: "POST",
    headers: key !== null ? { "Idempotency-Key": key } : {},
    body: body as Record<string, unknown>,
  });
}

describe("suppliers + orders PERS-S4 (sin DB no rompe)", () => {
  it("alta 201 + duplicado 409 y orden 201 idempotente", async () => {
    const s1 = await POSTSupplier(
      req("http://x/api/suppliers", null, { cuit: CUIT, nombre: "Distribuidora Sur" }),
    );
    expect(s1.status).toBe(201);
    const s2 = await POSTSupplier(
      req("http://x/api/suppliers", null, { cuit: CUIT, nombre: "Distribuidora Sur" }),
    );
    expect(s2.status).toBe(409);

    const o1 = await POSTOrder(
      req("http://x/api/purchase-orders", "oc-t1", {
        supplier_cuit: CUIT,
        lineas: [{ sku: "yerba", qty: 10, costo_centavos: 1648000 }],
        creado_por: "d",
      }),
    );
    expect(o1.status).toBe(201);
    expect(((await o1.json()) as Record<string, unknown>)["total_centavos"]).toBe("16480000");
    const o2 = await POSTOrder(
      req("http://x/api/purchase-orders", "oc-t1", {
        supplier_cuit: CUIT,
        lineas: [{ sku: "yerba", qty: 10, costo_centavos: 1648000 }],
        creado_por: "d",
      }),
    );
    expect(o2.status).toBe(409);
  });
});
