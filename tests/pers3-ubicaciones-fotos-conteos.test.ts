import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { locations, productPhotos, products, productCodes, stockCounts, stockCountLines, stockMovements, stockLots } from "../src/db/schema.js";
import { nivelStock } from "../src/lib/repos/stock.js";
import { GET as getLocations, POST as postLocations } from "../src/pages/api/locations.js";
import { POST as postProducts } from "../src/pages/api/products.js";
import { POST as postLots } from "../src/pages/api/lots.js";
import { POST as postCounts, PATCH as patchCounts } from "../src/pages/api/counts.js";
import { POST as postConteo } from "../src/pages/api/stock/conteo.js";
import { ctx } from "./helpers/ctx.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return ctx(url, { method: "POST", body: body as Record<string, unknown>, headers });
}

describe("PERS3 single sin DB: ubicaciones y conteos como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("ubicaciones: alta 201 y duplicado 409 sin importar mayusculas", async () => {
    const a = (await postLocations(post("http://x/api/locations", { nombre: "Deposito P3" }))) as Response;
    expect(a.status).toBe(201);
    const b = (await postLocations(post("http://x/api/locations", { nombre: "deposito p3" }))) as Response;
    expect(b.status).toBe(409);
    const g = (await getLocations(ctx("http://x/api/locations"))) as Response;
    expect(((await g.json()) as { ubicaciones: unknown[] }).ubicaciones.length).toBe(1);
  });

  it("conteos: crear y confirmar de dueno ajusta stock", async () => {
    await postLots(post("http://x/api/lots", { sku: "P3-SINGLE", cantidad: 10 }));
    const c = (await postCounts(
      post("http://x/api/counts", { contado_por: "emp", lineas: [{ sku: "P3-SINGLE", fisico: 8 }] }, { "Idempotency-Key": "p3-single-k1" }),
    )) as Response;
    expect(c.status).toBe(201);
    const cj = (await c.json()) as { id: string };
    const p = (await patchCounts(
      ctx(`http://x/api/counts?id=${cj.id}`, { method: "PATCH", body: { rol: "dueno", confirmado_por: "due", motivo: "ajuste" } }),
    )) as Response;
    expect(p.status).toBe(200);
    expect(nivelStock("P3-SINGLE")).toBe(8);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 12);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

const nombreUbi = `Dep P3 ${sufijoPG}`;
const skuFoto = `P3F${sufijoPG}`.toUpperCase().slice(0, 32);
const skuConteo = `P3C${sufijoPG}`.toUpperCase().slice(0, 32);
const skuSector = `P3S${sufijoPG}`.toUpperCase().slice(0, 32);
const keyConteo = `p3-conteo-${sufijoPG}`;
const keySector = `p3-sector-${sufijoPG}`;
const keyLoteConteo = `p3-lote-c-${sufijoPG}`;
const keyLoteSector = `p3-lote-s-${sufijoPG}`;

describe.skipIf(!hayPG)("PERS3 multi con PG local: ubicaciones, fotos y conteos aislados por tenant", () => {
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
          .where(inArray(stockCounts.idemKey, [keyConteo, keySector]));
        for (const co of conteos) {
          await db.delete(stockCountLines).where(eq(stockCountLines.countId, co.id));
        }
        await db.delete(stockCounts).where(inArray(stockCounts.idemKey, [keyConteo, keySector]));
        for (const sku of [skuFoto, skuConteo, skuSector]) {
          await db.delete(stockMovements).where(eq(stockMovements.sku, sku));
          await db.delete(stockLots).where(eq(stockLots.sku, sku));
          await db.delete(productPhotos).where(eq(productPhotos.sku, sku));
          await db.delete(productCodes).where(eq(productCodes.sku, sku));
          await db.delete(products).where(eq(products.sku, sku));
        }
        await db.delete(locations).where(eq(locations.nombre, nombreUbi));
      });
    }
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("ubicacion creada en A queda en locations de A y B no la ve; duplicado case-insensitive 409", async () => {
    fijarMulti();
    const r1 = (await conTenant("tenant-a", () => postLocations(post("http://x/api/locations", { nombre: nombreUbi })))) as Response;
    expect(r1.status).toBe(201);
    const dup = (await conTenant("tenant-a", () => postLocations(post("http://x/api/locations", { nombre: nombreUbi.toLowerCase() })))) as Response;
    expect(dup.status).toBe(409);
    const gA = (await conTenant("tenant-a", () => getLocations(ctx("http://x/api/locations")))) as Response;
    const jA = (await gA.json()) as { ubicaciones: Array<{ nombre: string }> };
    expect(jA.ubicaciones.some((u) => u.nombre === nombreUbi)).toBe(true);
    const gB = (await conTenant("tenant-b", () => getLocations(ctx("http://x/api/locations")))) as Response;
    const jB = (await gB.json()) as { ubicaciones: Array<{ nombre: string }> };
    expect(jB.ubicaciones.some((u) => u.nombre === nombreUbi)).toBe(false);
    const filasA = await conTenant("tenant-a", async () => getTenantDb().select().from(locations).where(eq(locations.nombre, nombreUbi)));
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () => getTenantDb().select().from(locations).where(eq(locations.nombre, nombreUbi)));
    expect(filasB.length).toBe(0);
  });

  it("producto con foto en A deja fila en product_photos de A y B no la ve", async () => {
    fijarMulti();
    const r = (await conTenant(
      "tenant-a",
      () => postProducts(post("http://x/api/products", { sku: skuFoto, nombre: "Foto P3", precio_centavos: 1000, foto: { url: "https://example.com/foto.jpg" } })),
    )) as Response;
    expect(r.status).toBe(201);
    const fotosA = await conTenant("tenant-a", async () => getTenantDb().select().from(productPhotos).where(eq(productPhotos.sku, skuFoto)));
    expect(fotosA.length).toBe(1);
    expect(fotosA[0]?.url).toBe("https://example.com/foto.jpg");
    const fotosB = await conTenant("tenant-b", async () => getTenantDb().select().from(productPhotos).where(eq(productPhotos.sku, skuFoto)));
    expect(fotosB.length).toBe(0);
  });

  it("crear+confirmar conteo en A escribe counts/lines en A, ajusta stock y la key repetida da 409", async () => {
    fijarMulti();
    const rp = (await conTenant(
      "tenant-a",
      () => postProducts(post("http://x/api/products", { sku: skuConteo, nombre: "Conteo P3", precio_centavos: 1000 })),
    )) as Response;
    expect(rp.status).toBe(201);
    const rl = (await conTenant(
      "tenant-a",
      () => postLots(post("http://x/api/lots", { sku: skuConteo, cantidad: 10 }, { "Idempotency-Key": keyLoteConteo })),
    )) as Response;
    expect(rl.status).toBe(201);
    const rc = (await conTenant(
      "tenant-a",
      () => postCounts(post("http://x/api/counts", { contado_por: "emp", lineas: [{ sku: skuConteo, fisico: 7 }] }, { "Idempotency-Key": keyConteo })),
    )) as Response;
    expect(rc.status).toBe(201);
    const cj = (await rc.json()) as { id: string };
    const dup = (await conTenant(
      "tenant-a",
      () => postCounts(post("http://x/api/counts", { contado_por: "emp", lineas: [{ sku: skuConteo, fisico: 7 }] }, { "Idempotency-Key": keyConteo })),
    )) as Response;
    expect(dup.status).toBe(409);
    const cf = (await conTenant(
      "tenant-a",
      () => patchCounts(ctx(`http://x/api/counts?id=${cj.id}`, { method: "PATCH", body: { rol: "dueno", confirmado_por: "due", motivo: "ajuste" } })),
    )) as Response;
    expect(cf.status).toBe(200);
    const cabA = await conTenant("tenant-a", async () => getTenantDb().select().from(stockCounts).where(eq(stockCounts.idemKey, keyConteo)));
    expect(cabA.length).toBe(1);
    expect(cabA[0]?.estado).toBe("confirmado");
    const linA = await conTenant("tenant-a", async () => getTenantDb().select().from(stockCountLines).where(eq(stockCountLines.countId, cabA[0]?.id ?? "")));
    expect(linA.length).toBe(1);
    expect(linA[0]?.fisico).toBe(7);
    const prodA = await conTenant("tenant-a", async () =>
      getTenantDb().select({ sku: products.sku, stockActual: products.stockActual }).from(products).where(eq(products.sku, skuConteo)),
    );
    expect(prodA[0]?.stockActual).toBe(7);
    const cabB = await conTenant("tenant-b", async () => getTenantDb().select().from(stockCounts).where(eq(stockCounts.idemKey, keyConteo)));
    expect(cabB.length).toBe(0);
  });

  it("conteoPorSector en A escribe cabecera+lineas en A y compensatorio solo en A", async () => {
    fijarMulti();
    const rp = (await conTenant(
      "tenant-a",
      () => postProducts(post("http://x/api/products", { sku: skuSector, nombre: "Sector P3", precio_centavos: 1000 })),
    )) as Response;
    expect(rp.status).toBe(201);
    const rl = (await conTenant(
      "tenant-a",
      () => postLots(post("http://x/api/lots", { sku: skuSector, cantidad: 10 }, { "Idempotency-Key": keyLoteSector })),
    )) as Response;
    expect(rl.status).toBe(201);
    const rs = (await conTenant(
      "tenant-a",
      () => postConteo(post("http://x/api/stock/conteo", { sector: "general", lineas: [{ sku: skuSector, fisico: 6 }] }, { "Idempotency-Key": keySector })),
    )) as Response;
    expect(rs.status).toBe(201);
    const cabA = await conTenant("tenant-a", async () => getTenantDb().select().from(stockCounts).where(eq(stockCounts.idemKey, keySector)));
    expect(cabA.length).toBe(1);
    expect(cabA[0]?.sector).toBe("general");
    const linA = await conTenant("tenant-a", async () => getTenantDb().select().from(stockCountLines).where(eq(stockCountLines.countId, cabA[0]?.id ?? "")));
    expect(linA.length).toBe(1);
    const movA = await conTenant("tenant-a", async () => getTenantDb().select().from(stockMovements).where(eq(stockMovements.idemKey, keySector)));
    expect(movA.length).toBe(1);
    const movB = await conTenant("tenant-b", async () => getTenantDb().select().from(stockMovements).where(eq(stockMovements.idemKey, keySector)));
    expect(movB.length).toBe(0);
    const cabB = await conTenant("tenant-b", async () => getTenantDb().select().from(stockCounts).where(eq(stockCounts.idemKey, keySector)));
    expect(cabB.length).toBe(0);
  });
});
