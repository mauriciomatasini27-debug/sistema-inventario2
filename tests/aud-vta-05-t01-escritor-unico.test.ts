import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { products, stockLots, stockMovements } from "../src/db/schema.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearAlmacenLotes, crearAlmacenStock } from "../src/lib/repos/_almacen.js";
import { aplicarMovimiento } from "../src/lib/repos/stock.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);

describe.skipIf(!hayPG)("AUD-VTA-05 T01 el escritor único con Postgres", () => {
  let basePriv = "";
  const skus: string[] = [];
  const keys: string[] = [];

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  function skuNuevo(marca: string): string {
    const sku = `T01${marca}${sufijo}`.toUpperCase().slice(0, 32);
    skus.push(sku);
    return sku;
  }

  function keyNueva(marca: string): string {
    const key = `t01-${marca}-${sufijo}`;
    keys.push(key);
    return key;
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("aud_vta_05_t01", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    if (!basePriv) return;
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      if (keys.length > 0) await db.delete(stockMovements).where(inArray(stockMovements.idemKey, keys));
      if (skus.length > 0) {
        await db.delete(stockLots).where(inArray(stockLots.sku, skus));
        await db.delete(products).where(inArray(products.sku, skus));
      }
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  async function sembrar(sku: string, stock: number, restante: number): Promise<string> {
    const db = getTenantDb();
    await db.insert(products).values(filaPg({ sku, nombre: sku, precioCentavos: 1000n, stockActual: stock }));
    const filas = await db
      .insert(stockLots)
      .values(filaPg({ sku, cantidad: stock, cantidadRestante: restante, venceEl: null, costoCentavos: 100n }))
      .returning({ id: stockLots.id });
    const id = filas[0]?.id;
    if (!id) throw new Error("lote no creado");
    return id;
  }

  it("registra el movimiento, baja el Stock disponible y descuenta el Lote en una sola escritura", async () => {
    fijarMulti();
    const sku = skuNuevo("uno");
    const key = keyNueva("uno");
    await conTenant("tenant-a", async () => {
      const loteId = await sembrar(sku, 10, 10);
      const r = await aplicarMovimiento({ idemKey: key, sku, loteId, delta: -3, tipo: "VENTA", condicionResto: 3 });
      expect(r.fuente).toBe("db");
      const db = getTenantDb();
      const movs = await db.select().from(stockMovements).where(eq(stockMovements.idemKey, key));
      expect(movs).toHaveLength(1);
      expect(movs[0]).toMatchObject({ delta: -3, tipo: "VENTA", loteId });
      const prod = await db.select({ stockActual: products.stockActual }).from(products).where(eq(products.sku, sku));
      expect(prod[0]?.stockActual).toBe(7);
      const lote = await db
        .select({ restante: stockLots.cantidadRestante })
        .from(stockLots)
        .where(eq(stockLots.id, loteId));
      expect(lote[0]?.restante).toBe(7);
    });
  });

  it("si el Lote no alcanza, no quedan ni el movimiento ni el cambio de Stock disponible", async () => {
    fijarMulti();
    const sku = skuNuevo("falta");
    const key = keyNueva("falta");
    await conTenant("tenant-a", async () => {
      const loteId = await sembrar(sku, 2, 2);
      await expect(
        aplicarMovimiento({ idemKey: key, sku, loteId, delta: -3, tipo: "VENTA", condicionResto: 3 }),
      ).rejects.toThrow("el lote no alcanzó");
      const db = getTenantDb();
      const movs = await db.select().from(stockMovements).where(eq(stockMovements.idemKey, key));
      expect(movs).toHaveLength(0);
      const prod = await db.select({ stockActual: products.stockActual }).from(products).where(eq(products.sku, sku));
      expect(prod[0]?.stockActual).toBe(2);
      const lote = await db
        .select({ restante: stockLots.cantidadRestante })
        .from(stockLots)
        .where(eq(stockLots.id, loteId));
      expect(lote[0]?.restante).toBe(2);
    });
  });

  it("dos escrituras concurrentes no dejan resto negativo ni Stock disponible distinto de la suma de Lotes", async () => {
    fijarMulti();
    const sku = skuNuevo("con");
    const k1 = keyNueva("con1");
    const k2 = keyNueva("con2");
    await conTenant("tenant-a", async () => {
      const loteId = await sembrar(sku, 5, 5);
      const resultados = await Promise.allSettled([
        aplicarMovimiento({ idemKey: k1, sku, loteId, delta: -3, tipo: "VENTA", condicionResto: 3 }),
        aplicarMovimiento({ idemKey: k2, sku, loteId, delta: -3, tipo: "VENTA", condicionResto: 3 }),
      ]);
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1);
      const db = getTenantDb();
      const prod = await db.select({ stockActual: products.stockActual }).from(products).where(eq(products.sku, sku));
      const lote = await db
        .select({ restante: stockLots.cantidadRestante })
        .from(stockLots)
        .where(eq(stockLots.id, loteId));
      expect(lote[0]?.restante).toBe(2);
      expect(prod[0]?.stockActual).toBe(2);
      expect(prod[0]?.stockActual).toBe(lote[0]?.restante);
      const movs = await db.select().from(stockMovements).where(inArray(stockMovements.idemKey, [k1, k2]));
      expect(movs).toHaveLength(1);
    });
  });
});

describe("AUD-VTA-05 T01 el escritor único en memoria", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    resetStore();
  });

  it("descuenta Stock disponible y Lote y deja el movimiento en el Historial", async () => {
    const sku = `T01MEM${sufijo}`;
    const loteId = crypto.randomUUID();
    const key = `t01-mem-${sufijo}`;
    crearAlmacenStock().guardar(sku, 5);
    crearAlmacenLotes().guardar(loteId, { id: loteId, sku, cantidad: 5, cantidadRestante: 5, venceEl: null, costoCentavos: "100" });
    const r = await aplicarMovimiento({ idemKey: key, sku, loteId, delta: -2, tipo: "VENTA", condicionResto: 2 });
    expect(r.fuente).toBe("memoria");
    expect(crearAlmacenStock().obtener(sku)).toBe(3);
    expect(crearAlmacenLotes().obtener(loteId)?.cantidadRestante).toBe(3);
    expect(store.stockMoves.filter((m) => m.idemKey === key).map((m) => m.delta)).toEqual([-2]);
  });

  it("si el resto no alcanza, no muta ninguna proyección en memoria", async () => {
    const sku = `T01MEMF${sufijo}`;
    const loteId = crypto.randomUUID();
    const key = `t01-mem-falla-${sufijo}`;
    crearAlmacenStock().guardar(sku, 1);
    crearAlmacenLotes().guardar(loteId, { id: loteId, sku, cantidad: 1, cantidadRestante: 1, venceEl: null, costoCentavos: "100" });
    await expect(
      aplicarMovimiento({ idemKey: key, sku, loteId, delta: -2, tipo: "VENTA", condicionResto: 2 }),
    ).rejects.toThrow("el lote no alcanzó");
    expect(crearAlmacenStock().obtener(sku)).toBe(1);
    expect(crearAlmacenLotes().obtener(loteId)?.cantidadRestante).toBe(1);
    expect(store.stockMoves.filter((m) => m.idemKey === key)).toHaveLength(0);
  });
});
