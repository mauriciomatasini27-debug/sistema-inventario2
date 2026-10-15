import { beforeEach, describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { locations, products } from "../src/db/schema.js";
import { POST as postLocations } from "../src/pages/api/locations.js";
import { POST as postAsignar } from "../src/pages/api/locations/asignar.js";
import { GET as getProducts, POST as postProducts } from "../src/pages/api/products.js";
import { POST as postLots } from "../src/pages/api/lots.js";
import { ctx } from "./helpers/ctx.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function post(url: string, body: unknown) {
  return ctx(url, { method: "POST", body: body as Record<string, unknown> });
}

describe("CAT-S5 ubicaciones + asignacion masiva", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("ubicacion duplicada case-insensitive da 409", async () => {
    const a = (await postLocations(post("http://x/api/locations", { nombre: "Gondola 1" }))) as Response;
    expect(a.status).toBe(201);
    const b = (await postLocations(post("http://x/api/locations", { nombre: "gondola 1" }))) as Response;
    expect(b.status).toBe(409);
  });

  it("asignacion masiva setea location_id sin mover stock y audita por producto", async () => {
    const loc = (await postLocations(post("http://x/api/locations", { nombre: "Gondola 1" }))) as Response;
    expect(loc.status).toBe(201);
    const ubicacion = (await loc.json()) as { id: string };
    const p1 = (await postProducts(post("http://x/api/products", { sku: "UBI-A", nombre: "A", precio_centavos: 100 }))) as Response;
    expect(p1.status).toBe(201);
    const p2 = (await postProducts(post("http://x/api/products", { sku: "UBI-B", nombre: "B", precio_centavos: 200 }))) as Response;
    expect(p2.status).toBe(201);
    const l1 = (await postLots(post("http://x/api/lots", { sku: "UBI-A", cantidad: 7 }))) as Response;
    expect(l1.status).toBe(201);
    const l2 = (await postLots(post("http://x/api/lots", { sku: "UBI-B", cantidad: 4 }))) as Response;
    expect(l2.status).toBe(201);
    const movsAntes = store.stockMoves.length;
    const auditAntes = store.auditoria.length;
    const r = (await postAsignar(
      post("http://x/api/locations/asignar", { location_id: ubicacion.id, skus: ["UBI-A", "UBI-B"] }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ asignados: 2, no_encontrados: [] });
    const g = (await getProducts(ctx("http://x/api/products?q=UBI-"))) as Response;
    const fichas = ((await g.json()) as { productos: Array<{ sku: string; location_id: string | null }> }).productos;
    expect(fichas.find((f) => f.sku === "UBI-A")?.location_id).toBe(ubicacion.id);
    expect(fichas.find((f) => f.sku === "UBI-B")?.location_id).toBe(ubicacion.id);
    expect(store.stock.get("UBI-A")).toBe(7);
    expect(store.stock.get("UBI-B")).toBe(4);
    expect(store.stockMoves.length).toBe(movsAntes);
    expect(store.auditoria.length).toBe(auditAntes + 2);
  });

  it("reasignar misma ubicacion no audita; sku desconocido va a no_encontrados; ubicacion desconocida da 404", async () => {
    const loc = (await postLocations(post("http://x/api/locations", { nombre: "Gondola 1" }))) as Response;
    const ubicacion = (await loc.json()) as { id: string };
    await postProducts(post("http://x/api/products", { sku: "UBI-A", nombre: "A", precio_centavos: 100 }));
    const r1 = (await postAsignar(
      post("http://x/api/locations/asignar", { location_id: ubicacion.id, skus: ["UBI-A"] }),
    )) as Response;
    expect(r1.status).toBe(200);
    const auditTrasPrimera = store.auditoria.length;
    expect(auditTrasPrimera).toBe(1);
    const r2 = (await postAsignar(
      post("http://x/api/locations/asignar", { location_id: ubicacion.id, skus: ["UBI-A"] }),
    )) as Response;
    expect(r2.status).toBe(200);
    expect(store.auditoria.length).toBe(auditTrasPrimera);
    const r3 = (await postAsignar(
      post("http://x/api/locations/asignar", { location_id: ubicacion.id, skus: ["NOPE"] }),
    )) as Response;
    expect(r3.status).toBe(200);
    expect(await r3.json()).toEqual({ asignados: 0, no_encontrados: ["NOPE"] });
    const r4 = (await postAsignar(
      post("http://x/api/locations/asignar", { location_id: "00000000-0000-4000-8000-000000000000", skus: ["UBI-A"] }),
    )) as Response;
    expect([404, 422]).toContain(r4.status);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

const sufijoPG = `s5${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 12);
const nombreUbiPG = `Gondola PG ${sufijoPG}`;
const skuPG = `S5P${sufijoPG}`.toUpperCase().slice(0, 32);

describe.skipIf(!hayPG)("CAT-S5 PG: location_id persiste y FK deja null al borrar ubicacion", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(products).where(eq(products.sku, skuPG));
      await db.delete(locations).where(eq(locations.nombre, nombreUbiPG));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("migracion 0021 aplicada, asignacion persiste y borrar ubicacion deja null", async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "location_id" uuid`);
      await db.execute(sql`DO $$ BEGIN
        ALTER TABLE "products" ADD CONSTRAINT "products_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "products_location_id_idx" ON "products" ("location_id")`);
      const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'location_id'`);
      expect(cols.length).toBe(1);
    });
    const loc = (await conTenant("tenant-a", () =>
      postLocations(post("http://x/api/locations", { nombre: nombreUbiPG })),
    )) as Response;
    expect(loc.status).toBe(201);
    const ubicacion = (await loc.json()) as { id: string };
    const p = (await conTenant("tenant-a", () =>
      postProducts(post("http://x/api/products", { sku: skuPG, nombre: "PG S5", precio_centavos: 500 })),
    )) as Response;
    expect(p.status).toBe(201);
    const a = (await conTenant("tenant-a", () =>
      postAsignar(post("http://x/api/locations/asignar", { location_id: ubicacion.id, skus: [skuPG] })),
    )) as Response;
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ asignados: 1, no_encontrados: [] });
    const filas = await conTenant("tenant-a", async () =>
      getTenantDb().select({ locationId: products.locationId }).from(products).where(eq(products.sku, skuPG)),
    );
    expect(filas[0]?.locationId).toBe(ubicacion.id);
    await conTenant("tenant-a", async () => getTenantDb().delete(locations).where(eq(locations.id, ubicacion.id)));
    const trasBorrado = await conTenant("tenant-a", async () =>
      getTenantDb().select({ locationId: products.locationId }).from(products).where(eq(products.sku, skuPG)),
    );
    expect(trasBorrado[0]?.locationId).toBeNull();
  });
});
