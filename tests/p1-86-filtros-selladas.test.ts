import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { products } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { listarCatalogoConFuente } from "../src/lib/repos/whatsapp.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
const hayPG = Boolean(process.env.PG_TEST_URL_A);

function guardarEnv(): Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> {
  const snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restaurarEnv(snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe.skipIf(!hayPG)("P1-86 shared: catálogo y stock ya sellados no cruzan", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const skuA = `P86A${randomUUID().slice(0, 8)}`.toUpperCase();
  const skuB = `P86B${randomUUID().slice(0, 8)}`.toUpperCase();
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(async () => {
    try {
      await conTenant(tenantA, async () => {
        await getTenantDb().delete(products).where(eq(products.sku, skuA));
      });
      await conTenant(tenantB, async () => {
        await getTenantDb().delete(products).where(eq(products.sku, skuB));
      });
    } finally {
      restaurarEnv(snap);
      resetStore();
    }
  });

  it("B no ve el producto ni el stock de A en el catálogo del bot", async () => {
    await conTenant(tenantA, async () => {
      await getTenantDb().insert(products).values(
        filaPg(
          { sku: skuA, nombre: "P86 solo A", precioCentavos: 111n, stockActual: 999, minStock: 1 },
          tenantA,
        ),
      );
    });
    await conTenant(tenantB, async () => {
      await getTenantDb().insert(products).values(
        filaPg(
          { sku: skuB, nombre: "P86 solo B", precioCentavos: 222n, stockActual: 2, minStock: 1 },
          tenantB,
        ),
      );
    });

    const catB = await conTenant(tenantB, () => listarCatalogoConFuente(tenantB));
    expect(catB.items.some((p) => p.sku === skuA || p.stock === 999)).toBe(false);
    expect(catB.items.some((p) => p.sku === skuB)).toBe(true);
  });
});
