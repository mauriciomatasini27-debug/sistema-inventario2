import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products } from "../src/db/schema.js";
import { productAliases } from "../src/db/schema-whatsapp.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as GETConsult } from "../src/pages/api/whatsapp/consult.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const tenantA = randomUUID();
const tenantB = randomUUID();
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const skuA = `ALIAS-A-${sufijo}`.toUpperCase();
const skuB = `ALIAS-B-${sufijo}`.toUpperCase();
const aliasA = `coca chica ${sufijo}`;
const aliasB = `agua chica ${sufijo}`;
// Solo dígitos: extraer_termino borra "de", "el", "la" aun dentro de palabras.
const num = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const skuCafe = `ALIAS-CAFE-${num}`;
const skuListas = Array.from({ length: 3 }, (_, i) => `ALIAS-YERBA${i}-${num}`);
const skuMuchos = Array.from({ length: 6 }, (_, i) => `ALIAS-FIDEO${i}-${num}`);
const todosSkus = () => [skuA, skuB, skuCafe, ...skuListas, ...skuMuchos];

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env[`TENANT_DATABASE_URL_${tenantA}`] = process.env.PG_TEST_URL_A ?? "";
  process.env[`TENANT_DATABASE_URL_${tenantB}`] = process.env.PG_TEST_URL_B ?? "";
}

function limpiarEnv() {
  delete process.env.TENANT_MODE;
  delete process.env[`TENANT_DATABASE_URL_${tenantA}`];
  delete process.env[`TENANT_DATABASE_URL_${tenantB}`];
}

function sesion(tenantId: string): string {
  const c = crearSesion({ googleSub: "bot2-alias", tenantId, ahora: new Date() });
  control.sessions.set(c.registro.idHash, c.registro);
  return c.idPlano;
}

async function consultar(tenantId: string, term: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const plano = sesion(tenantId);
  return conTenant(tenantId, async () => {
    const r = (await GETConsult(
      ctx(`http://x/api/whatsapp/consult?term=${encodeURIComponent(term)}`, {
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    )) as Response;
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  });
}

describe.skipIf(!hayPG)("BOT2 alias en consulta de stock", () => {
  beforeAll(async () => {
    fijarMulti();
    resetStore();
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      await db.insert(products).values({ sku: skuA, nombre: "Gaseosa cola 500 ml", precioCentavos: 180000n, stockActual: 12 });
      await db.insert(productAliases).values({ tenantId: tenantA, sku: skuA, alias: aliasA, aliasNorm: aliasA });
      // Alias de otro comercio en la misma base: el filtro por tenant lo deja afuera.
      await db.insert(productAliases).values({ tenantId: tenantB, sku: skuA, alias: aliasB, aliasNorm: aliasB });
    });
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      // Alias guardado con tildes y mayúsculas; dos alias del mismo producto.
      await db.insert(products).values({ sku: skuCafe, nombre: `Molienda tostada ${num}`, precioCentavos: 300000n, stockActual: 4 });
      await db.insert(productAliases).values([
        { tenantId: tenantA, sku: skuCafe, alias: `Café TOSTÁDO ${num}`, aliasNorm: `cafe tostado ${num}` },
        { tenantId: tenantA, sku: skuCafe, alias: `café ${num}`, aliasNorm: `cafe ${num}` },
      ]);
      for (const [i, sku] of skuListas.entries()) {
        await db.insert(products).values({ sku, nombre: `Producto lista ${i} ${num}`, precioCentavos: 100000n, stockActual: 3 });
        await db.insert(productAliases).values({ tenantId: tenantA, sku, alias: `mate ${num} ${i}`, aliasNorm: `mate ${num} ${i}` });
      }
      for (const [i, sku] of skuMuchos.entries()) {
        await db.insert(products).values({ sku, nombre: `Producto pasta ${i} ${num}`, precioCentavos: 100000n, stockActual: 3 });
        await db.insert(productAliases).values({ tenantId: tenantA, sku, alias: `pasta ${num} ${i}`, aliasNorm: `pasta ${num} ${i}` });
      }
    });
    await conTenant(tenantB, async () => {
      const db = getTenantDb();
      await db.insert(products).values({ sku: skuB, nombre: "Agua mineral 500 ml", precioCentavos: 90000n, stockActual: 7 });
      await db.insert(productAliases).values({ tenantId: tenantB, sku: skuB, alias: aliasB, aliasNorm: aliasB });
    });
  });

  afterAll(async () => {
    fijarMulti();
    for (const tenant of [tenantA, tenantB]) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.delete(productAliases).where(inArray(productAliases.tenantId, [tenantA, tenantB]));
        await db.delete(products).where(inArray(products.sku, todosSkus()));
      });
    }
    limpiarEnv();
  });

  it("un alias del tenant resuelve al sku correcto con decision directo", async () => {
    const r = await consultar(tenantA, `cuantos ${aliasA} tengo`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ intencion: "stock", decision: "directo", sku: skuA, fuente: "db" });
    expect(String(r.body["texto"])).toContain("Gaseosa cola 500 ml");
  });

  it("un alias de otro tenant no aparece en la consulta", async () => {
    const r = await consultar(tenantA, `cuantos ${aliasB} tengo`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ intencion: "stock", decision: "sin_resultados", fuente: "db" });
    expect(r.body).not.toHaveProperty("sku");
  });

  it("normaliza tildes y mayúsculas del alias y del texto", async () => {
    const r = await consultar(tenantA, `cuantos CAFÉ TOSTADO ${num} tengo`);
    expect(r.body).toMatchObject({ decision: "directo", sku: skuCafe, fuente: "db" });
  });

  it("dos alias que coinciden con el mismo producto dan una sola opción", async () => {
    // "cafe <num>" está contenido en los dos alias del producto: sigue siendo un candidato.
    const r = await consultar(tenantA, `cuantos cafe ${num} tengo`);
    expect(r.body).toMatchObject({ decision: "directo", sku: skuCafe });
  });

  it("de 2 a 5 productos por alias arma la lista para elegir", async () => {
    const r = await consultar(tenantA, `cuantos mate ${num} tengo`);
    expect(r.body).toMatchObject({ decision: "desambiguar", fuente: "db" });
    expect([...(r.body["opciones"] as string[])].sort()).toEqual([...skuListas].sort());
  });

  it("más de 5 productos por alias pide precisar", async () => {
    const r = await consultar(tenantA, `cuantos pasta ${num} tengo`);
    expect(r.body).toMatchObject({ decision: "precisar", total: 6, fuente: "db" });
  });
});
