import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, stockLots, stockMovements, productCodes } from "../src/db/schema.js";
import { GET as GETPull } from "../src/pages/api/sync/pull.js";
import { POST as postProducts } from "../src/pages/api/products.js";
import { POST as postLots } from "../src/pages/api/lots.js";
import { ctx } from "./helpers/ctx.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

interface PullJson {
  movimientos: unknown[];
  cursor_nuevo: string;
  mappings: unknown[];
  catalogo: { stock: Record<string, number>; prices: Record<string, number> };
  total: number;
  fuente?: string;
}

describe("PERS6-S1 single sin DB: catalogo del pull sale de memoria como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("pull con cursor 0 incluye demo-sku-1 con precio y stock del store y sin fuente db", async () => {
    const res = (await GETPull(ctx("http://localhost/api/sync/pull?cursor=0&limite=50"))) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as PullJson;
    expect(j.catalogo).toHaveProperty("stock");
    expect(j.catalogo).toHaveProperty("prices");
    expect(j.catalogo.prices["demo-sku-1"]).toBe(15000);
    expect(j.catalogo.stock["demo-sku-1"]).toBe(10);
    expect("fuente" in j).toBe(false);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 12);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("PERS6-S1 multi con PG local: catalogo del pull sale de products (ADR-0081)", () => {
  const skuPG = `P6C${sufijoPG}`.toUpperCase().slice(0, 32);
  const loteKey = `pers6-lote-${sufijoPG}`;
  const precioPG = 7750;
  const cantidadPG = 6;

  function post(url: string, body: unknown, headers: Record<string, string> = {}) {
    return ctx(url, { method: "POST", body: body as Record<string, unknown>, headers });
  }

  async function pullDe(tenant: "tenant-a" | "tenant-b"): Promise<PullJson> {
    const res = (await conTenant(tenant, () =>
      GETPull(ctx("http://localhost/api/sync/pull?cursor=0&limite=50")),
    )) as Response;
    expect(res.status).toBe(200);
    return (await res.json()) as PullJson;
  }

  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.delete(stockMovements).where(eq(stockMovements.idemKey, loteKey));
        await db.delete(stockLots).where(eq(stockLots.sku, skuPG));
        await db.delete(productCodes).where(eq(productCodes.sku, skuPG));
        await db.delete(products).where(eq(products.sku, skuPG));
      });
    }
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("pull de A refleja precio y stock del producto dado de alta en A; B no lo ve", async () => {
    fijarMulti();
    const rp = (await conTenant("tenant-a", () =>
      postProducts(post("http://x/api/products", { sku: skuPG, nombre: "Producto P6", precio_centavos: precioPG })),
    )) as Response;
    expect(rp.status).toBe(201);
    const rl = (await conTenant("tenant-a", () =>
      postLots(
        post("http://x/api/lots", { sku: skuPG, cantidad: cantidadPG }, { "Idempotency-Key": loteKey }),
      ),
    )) as Response;
    expect(rl.status).toBe(201);

    const filas = await conTenant("tenant-a", async () =>
      getTenantDb()
        .select({ sku: products.sku, stockActual: products.stockActual, precioCentavos: products.precioCentavos })
        .from(products)
        .where(eq(products.sku, skuPG)),
    );
    expect(filas.length).toBe(1);

    const enA = await pullDe("tenant-a");
    expect(enA.fuente).toBe("db");
    expect(enA.catalogo.prices[skuPG]).toBe(precioPG);
    expect(enA.catalogo.stock[skuPG]).toBe(filas[0]?.stockActual ?? cantidadPG);

    const enB = await pullDe("tenant-b");
    expect(enB.fuente).toBe("db");
    expect(enB.catalogo.prices[skuPG]).toBeUndefined();
    expect(enB.catalogo.stock[skuPG]).toBeUndefined();
  });

  it("tras resetStore el pull de A sigue mostrando el catalogo de la base", async () => {
    fijarMulti();
    resetStore();
    const enA = await pullDe("tenant-a");
    expect(enA.fuente).toBe("db");
    expect(enA.catalogo.prices[skuPG]).toBe(precioPG);
    expect(enA.catalogo.stock[skuPG]).toBe(cantidadPG);
  });
});
