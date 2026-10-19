import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { SECTOR_RE } from "../src/modules/inventario/sectores.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, stockCountLines, stockCounts, stockMovements } from "../src/db/schema.js";
import { GET as getProducts, POST as postProducts, PATCH as patchProducts } from "../src/pages/api/products.js";
import { POST as postConteo } from "../src/pages/api/stock/conteo.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return ctx(url, { method: "POST", body: body as Record<string, unknown>, headers });
}

function patch(url: string, body: unknown) {
  return ctx(url, { method: "PATCH", body: body as Record<string, unknown> });
}

describe("CAT-S9 single sin DB: sector normalizado", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("el CHECK de 0029 usa el mismo formato que SECTOR_RE", () => {
    const sql = readFileSync("drizzle/0029_products_sector.sql", "utf8");
    expect(sql).toContain(SECTOR_RE.source);
  });

  it("alta con sector invalido cae a general", async () => {
    const r = (await postProducts(
      post("http://x/api/products", { sku: "SEC-SINGLE-A", nombre: "Sector A", precio_centavos: 100, sector: "Heladera A" }),
    )) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { sector: string }).sector).toBe("general");
  });

  it("patch con sector vacio cae a general", async () => {
    await postProducts(
      post("http://x/api/products", { sku: "SEC-SINGLE-B", nombre: "Sector B", precio_centavos: 100, sector: "heladera" }),
    );
    const p = (await patchProducts(patch("http://x/api/products?sku=SEC-SINGLE-B", { sector: "" }))) as Response;
    expect(p.status).toBe(200);
    expect(((await p.json()) as { sector: string }).sector).toBe("general");
  });

  it("un sector de 41 caracteres cae a general", async () => {
    const r = (await postProducts(
      post("http://x/api/products", { sku: "SEC-SINGLE-C", nombre: "Sector C", precio_centavos: 100, sector: "a".repeat(41) }),
    )) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { sector: string }).sector).toBe("general");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 12);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

const sku = `CATSEC${sufijoPG}`.toUpperCase().slice(0, 32);
const skuTipado = `${sku}T`.slice(0, 32);
const keyConteo = `catsec-${sufijoPG}`;
const keyOtroSector = `catsec-otro-${sufijoPG}`;

describe.skipIf(!hayPG)("CAT-S7/S8/S11 multi con PG: sector durable por tenant", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        const conteos = await db
          .select({ id: stockCounts.id })
          .from(stockCounts)
          .where(inArray(stockCounts.idemKey, [keyConteo, keyOtroSector]));
        for (const c of conteos) await db.delete(stockCountLines).where(eq(stockCountLines.countId, c.id));
        await db.delete(stockCounts).where(inArray(stockCounts.idemKey, [keyConteo, keyOtroSector]));
        await db.delete(stockMovements).where(inArray(stockMovements.sku, [sku, skuTipado]));
        await db.delete(products).where(inArray(products.sku, [sku, skuTipado]));
      });
    }
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("el alta guarda sector en products y sobrevive a resetStore", async () => {
    fijarMulti();
    const r = (await conTenant(
      "tenant-a",
      () => postProducts(post("http://x/api/products", { sku, nombre: "Sector PG", precio_centavos: 1000, sector: "heladera" })),
    )) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { sector: string }).sector).toBe("heladera");
    const filas = await conTenant("tenant-a", async () =>
      getTenantDb().select({ sector: products.sector }).from(products).where(eq(products.sku, sku)),
    );
    expect(filas[0]?.sector).toBe("heladera");

    resetStore();
    const g = (await conTenant("tenant-a", () => getProducts(ctx(`http://x/api/products?q=${sku}`)))) as Response;
    const body = (await g.json()) as { fuente: string; productos: Array<{ sku: string; sector: string }> };
    expect(body.fuente).toBe("db");
    expect(body.productos[0]?.sector).toBe("heladera");
  });

  it("el conteo lee el sector de la DB despues de resetStore", async () => {
    fijarMulti();
    resetStore();
    const ok = (await conTenant(
      "tenant-a",
      () => postConteo(post("http://x/api/stock/conteo", { sector: "heladera", lineas: [{ sku, fisico: 0 }] }, { "Idempotency-Key": keyConteo })),
    )) as Response;
    expect(ok.status).toBe(201);
    const mal = (await conTenant(
      "tenant-a",
      () => postConteo(post("http://x/api/stock/conteo", { sector: "general", lineas: [{ sku, fisico: 0 }] }, { "Idempotency-Key": keyOtroSector })),
    )) as Response;
    expect(mal.status).toBe(422);
    expect(((await mal.json()) as { error: string }).error).toBe("LINEA_INVALIDA");
  });

  it("el patch de sector persiste y lo ve solo el tenant dueno", async () => {
    fijarMulti();
    const p = (await conTenant(
      "tenant-a",
      () => patchProducts(patch(`http://x/api/products?sku=${sku}`, { sector: "freezer" })),
    )) as Response;
    expect(p.status).toBe(200);
    expect(((await p.json()) as { sector: string }).sector).toBe("freezer");
    const filas = await conTenant("tenant-a", async () =>
      getTenantDb().select({ sector: products.sector }).from(products).where(eq(products.sku, sku)),
    );
    expect(filas[0]?.sector).toBe("freezer");

    resetStore();
    const g = (await conTenant("tenant-a", () => getProducts(ctx(`http://x/api/products?q=${sku}`)))) as Response;
    const body = (await g.json()) as { productos: Array<{ sector: string }> };
    expect(body.productos[0]?.sector).toBe("freezer");

    const b = (await conTenant("tenant-b", () => getProducts(ctx(`http://x/api/products?q=${sku}`)))) as Response;
    const bodyB = (await b.json()) as { productos: unknown[] };
    expect(bodyB.productos).toEqual([]);
  });

  it("el insert tipado sin sector usa el default general", async () => {
    fijarMulti();
    const filas = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(products).values({ sku: skuTipado, nombre: "Tipado", precioCentavos: 0n });
      return db.select({ sector: products.sector }).from(products).where(eq(products.sku, skuTipado));
    });
    expect(filas[0]?.sector).toBe("general");
  });
});
