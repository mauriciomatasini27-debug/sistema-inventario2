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
import { filaPg, tenantIdParaFixture } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const tenantA = randomUUID();
const tenantB = randomUUID();
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const sufijoB = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const skuA = `ALIAS-A-${sufijo}`.toUpperCase();
const skuB = `ALIAS-B-${sufijoB}`.toUpperCase();
// Solo dígitos en consultas: extraer_termino borra "de", "el", "la" dentro de palabras.
// Tokens aislados sin prefijo compartido: trgm emparejaba alias vecinos por el mismo num.
const numCafe = `${Date.now()}c${Math.floor(Math.random() * 1e6)}`;
const numMate = `${Date.now()}m${Math.floor(Math.random() * 1e6)}`;
const numPasta = `${Date.now()}p${Math.floor(Math.random() * 1e6)}`;
// Sin substring compartido entre A y B: trgm <% los confundía con el mismo sufijo.
const aliasA = `rubia cola ${sufijo}`;
const aliasB = `agua mineral ${sufijoB}`;
const skuCafe = `ALIAS-CAFE-${numCafe}`;
const skuListas = Array.from({ length: 3 }, (_, i) => `ALIAS-YERBA${i}-${numMate}`);
const skuMuchos = Array.from({ length: 6 }, (_, i) => `ALIAS-FIDEO${i}-${numPasta}`);
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
      const tidA = tenantIdParaFixture(tenantA);
      await db.delete(productAliases).where(eq(productAliases.tenantId, tidA));
      await db.delete(products).where(eq(products.tenantId, tidA));
      await db.insert(products).values(filaPg({ sku: skuA, nombre: "Gaseosa cola 500 ml", precioCentavos: 180000n, stockActual: 12 }, tidA));
      await db.insert(productAliases).values({ tenantId: tidA, sku: skuA, alias: aliasA, aliasNorm: aliasA });
      await db.insert(products).values(filaPg({ sku: skuCafe, nombre: `Molienda tostada ${numCafe}`, precioCentavos: 300000n, stockActual: 4 }, tidA));
      await db.insert(productAliases).values([
        { tenantId: tidA, sku: skuCafe, alias: `Café TOSTÁDO ${numCafe}`, aliasNorm: `cafe tostado ${numCafe}` },
        { tenantId: tidA, sku: skuCafe, alias: `café ${numCafe}`, aliasNorm: `cafe ${numCafe}` },
      ]);
      for (const [i, sku] of skuListas.entries()) {
        await db.insert(products).values(filaPg({ sku, nombre: `Producto lista ${i} ${numMate}`, precioCentavos: 100000n, stockActual: 3 }, tidA));
        await db.insert(productAliases).values({ tenantId: tidA, sku, alias: `mate ${numMate} ${i}`, aliasNorm: `mate ${numMate} ${i}` });
      }
      for (const [i, sku] of skuMuchos.entries()) {
        await db.insert(products).values(filaPg({ sku, nombre: `Producto pasta ${i} ${numPasta}`, precioCentavos: 100000n, stockActual: 3 }, tidA));
        await db.insert(productAliases).values({ tenantId: tidA, sku, alias: `pasta ${numPasta} ${i}`, aliasNorm: `pasta ${numPasta} ${i}` });
      }
    });
    await conTenant(tenantB, async () => {
      const db = getTenantDb();
      const tidB = tenantIdParaFixture(tenantB);
      await db.delete(productAliases).where(eq(productAliases.tenantId, tidB));
      await db.delete(products).where(eq(products.tenantId, tidB));
      await db.insert(products).values(filaPg({ sku: skuB, nombre: "Agua mineral 500 ml", precioCentavos: 90000n, stockActual: 7 }, tidB));
      await db.insert(productAliases).values({ tenantId: tidB, sku: skuB, alias: aliasB, aliasNorm: aliasB });
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
    const r = await consultar(tenantA, `cuantos CAFÉ TOSTADO ${numCafe} tengo`);
    expect(r.body).toMatchObject({ decision: "directo", sku: skuCafe, fuente: "db" });
  });

  it("dos alias que coinciden con el mismo producto dan una sola opción", async () => {
    // "cafe <num>" está contenido en los dos alias del producto: sigue siendo un candidato.
    const r = await consultar(tenantA, `cuantos cafe ${numCafe} tengo`);
    expect(r.body).toMatchObject({ decision: "directo", sku: skuCafe });
  });

  it("de 2 a 5 productos por alias arma la lista para elegir", async () => {
    const r = await consultar(tenantA, `cuantos mate ${numMate} tengo`);
    expect(r.body).toMatchObject({ decision: "desambiguar", fuente: "db" });
    expect([...(r.body["opciones"] as string[])].sort()).toEqual([...skuListas].sort());
  });

  it("más de 5 productos por alias pide precisar", async () => {
    const r = await consultar(tenantA, `cuantos pasta ${numPasta} tengo`);
    expect(r.body).toMatchObject({ decision: "precisar", total: 6, fuente: "db" });
  });
});
