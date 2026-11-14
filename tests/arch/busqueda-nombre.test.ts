import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { consultarNombre } from "../../src/lib/repos/busqueda-nombre.js";
import { getTenantDb } from "../../src/lib/db.js";
import { products } from "../../src/db/schema.js";
import { productAliases } from "../../src/db/schema-whatsapp.js";
import { filaPg } from "../helpers/pg-tenant-fixture.js";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

const PROHIBIDO_EN_RUTAS = ["buscar_en_catalogo", "listarProductosConsulta", "puntaje-memoria", "similarity(", "pg_trgm", "unaccent"];

describe("arquitectura búsqueda por nombre", () => {
  for (const archivo of ["src/pages/api/whatsapp/webhook.ts", "src/pages/api/whatsapp/consult.ts"] as const) {
    it(`${archivo} usa consultarNombre y no filtra en memoria`, () => {
      const texto = readFileSync(join(RAIZ, archivo), "utf8");
      expect(texto).toContain("consultarNombre");
      for (const p of PROHIBIDO_EN_RUTAS) {
        expect(texto, `${archivo} no debe mencionar ${p}`).not.toContain(p);
      }
    });
  }

  it("migración 0041 define f_norm, gin_trgm_ops y operador <%", () => {
    const sql = readFileSync(join(RAIZ, "drizzle/0041_busqueda_trgm.sql"), "utf8");
    expect(sql).toContain("f_norm");
    expect(sql).toContain("gin_trgm_ops");
    expect(sql).toContain("<%");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A || process.env.DATABASE_URL);

describe.skipIf(!hayPG)("consultarNombre con PG (integración)", () => {
  const skuBase = `TRGM${Date.now().toString(36)}`.slice(0, 20).toUpperCase();
  const skuLeche = `${skuBase}L`;
  const skuOreo = `${skuBase}O`;

  beforeAll(() => {
    if (process.env.PG_TEST_URL_A && !process.env.TENANT_DATABASE_URL) {
      process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    }
    delete process.env.TENANT_MODE;
  });

  afterAll(async () => {
    const db = getTenantDb();
    await db.delete(productAliases).where(eq(productAliases.sku, skuLeche));
    await db.delete(products).where(eq(products.sku, skuLeche));
    await db.delete(products).where(eq(products.sku, skuOreo));
  });

  it("milca encuentra productos Milka vía SQL", async () => {
    const db = getTenantDb();
    await db.insert(products).values([
      filaPg({ sku: skuLeche, nombre: "Milka leche", precioCentavos: 100n, stockActual: 5, minStock: 2 }),
      filaPg({ sku: skuOreo, nombre: "Milka oreo", precioCentavos: 100n, stockActual: 3, minStock: 2 }),
    ]);
    await db.insert(productAliases).values(filaPg({ sku: skuLeche, alias: "milka leche barra", aliasNorm: "milka leche barra" }));

    const { resolucion } = await consultarNombre({ tenantId: null, texto: "cuantos milca tengo" });
    expect(["directo", "desambiguar"]).toContain(resolucion.kind);
    if (resolucion.kind === "directo") {
      expect([skuLeche, skuOreo]).toContain(resolucion.ficha.sku);
    } else if (resolucion.kind === "desambiguar") {
      const skus = resolucion.opciones.map((o) => o.sku);
      expect(skus.some((s) => s === skuLeche || s === skuOreo)).toBe(true);
    }
  });
});
