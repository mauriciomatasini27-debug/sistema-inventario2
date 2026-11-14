import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, stockMovements } from "../src/db/schema.js";
import { cargarStockInicial } from "../src/lib/repos/stock-inicial.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`
  .replace(/[^a-z0-9]/g, "")
  .slice(0, 10);
const sku = `S4B${sufijo}`.toUpperCase().slice(0, 32);

describe.skipIf(!hayPG)("STOCK-S4b stock inicial: ALTA única bajo dos Guardar", () => {
  let basePriv = "";

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("stock_s4_inicial_race", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(stockMovements).where(eq(stockMovements.sku, sku));
      await db.delete(products).where(eq(products.sku, sku));
      await db.insert(products).values(
        filaPg({
          sku,
          nombre: "Race",
          precioCentavos: 100n,
          stockActual: 0,
          origen: "alta_al_vender",
        }),
      );
    });
  });

  afterAll(async () => {
    if (!basePriv) return;
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(stockMovements).where(eq(stockMovements.sku, sku));
      await db.delete(products).where(eq(products.sku, sku));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  it("veinte cargarStockInicial en paralelo: uno ok, los demás NO_PENDIENTE, una fila y stock = delta", async () => {
    fijarMulti();

    const resultados = await conTenant("tenant-a", () =>
      Promise.all(Array.from({ length: 20 }, () => cargarStockInicial(sku, 7))),
    );

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok)).toEqual(
      Array.from({ length: 19 }, () => ({ ok: false, codigo: "NO_PENDIENTE" })),
    );

    const estado = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const movs = await db.select().from(stockMovements).where(eq(stockMovements.sku, sku));
      const prods = await db.select().from(products).where(eq(products.sku, sku));
      return { movs, prods };
    });

    expect(estado.movs).toHaveLength(1);
    expect(estado.movs[0]?.tipo).toBe("ALTA");
    expect(estado.movs[0]?.idemKey).toBe(`stock-inicial:${sku}`);
    expect(estado.movs[0]?.delta).toBe(7);
    expect(estado.prods[0]?.stockActual).toBe(7);
  });

  it("existe el índice parcial único de stock inicial", async () => {
    const sql = postgres(basePriv, { max: 1 });
    try {
      const filas = await sql<{ indexdef: string }[]>`
        select indexdef
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'stock_movements'
          and indexname = 'stock_movements_stock_inicial_unico'
      `;
      expect(filas).toHaveLength(1);
      expect(filas[0]?.indexdef).toContain("UNIQUE");
      expect(filas[0]?.indexdef).toContain("stock-inicial:%");
    } finally {
      await sql.end();
    }
  });
});
