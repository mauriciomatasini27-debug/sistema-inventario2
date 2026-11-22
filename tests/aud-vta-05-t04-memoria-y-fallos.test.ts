import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { products, stockLots, stockMovements } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearAlmacenLotes, crearAlmacenStock } from "../src/lib/repos/_almacen.js";
import { crearLote } from "../src/lib/repos/lotes.js";
import { BaseNoDisponible } from "../src/lib/server-db.js";
import { aplicarMovimiento } from "../src/lib/repos/stock.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
const hayPG = Boolean(process.env.PG_TEST_URL_A);

describe("AUD-VTA-05 T04 el mismo escritor en memoria", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.DEFAULT_TENANT_ID;
    resetStore();
  });

  it("la venta descuenta el Lote además del Stock disponible y del Historial", async () => {
    const sku = `T04MEM${sufijo}`;
    const key = `t04-mem-${sufijo}`;
    const alta = await crearLote({
      sku,
      cantidad: 10,
      venceEl: null,
      costoCentavos: 100,
      controlaVencimiento: false,
      idemKey: `t04-alta-${sufijo}`,
    });
    expect(alta.ok).toBe(true);
    if (!alta.ok) throw new Error("el alta falló");
    const loteId = alta.lote.id;

    const r = await registrar_venta({
      key,
      lineas: [{ product_id: sku, qty: 3, precio_centavos: 1000 }],
      medio: "Efectivo",
      deviceCode: `t04-${sufijo}`.slice(0, 32),
      seqLocal: 1,
      offline: false,
      clientOccurredAt: "2026-11-06T15:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("la venta falló");
    expect(r.venta.fuente).toBe("memoria");

    expect(crearAlmacenStock().obtener(sku)).toBe(7);
    expect(crearAlmacenLotes().obtener(loteId)?.cantidadRestante).toBe(7);
    expect(
      store.stockMoves.filter((m) => m.idemKey === key).map((m) => ({ delta: m.delta, loteId: m.loteId, tipo: m.tipo })),
    ).toEqual([{ delta: -3, loteId, tipo: "VENTA" }]);
  });

  it("sin base configurada, una venta rechazada no muta ninguna proyección", async () => {
    const sku = `T04ATOM${sufijo}`;
    const key = `t04-atom-${sufijo}`;
    const alta = await crearLote({
      sku,
      cantidad: 2,
      venceEl: null,
      costoCentavos: 100,
      controlaVencimiento: false,
      idemKey: `t04-alta-atom-${sufijo}`,
    });
    expect(alta.ok).toBe(true);
    if (!alta.ok) throw new Error("el alta falló");
    const loteId = alta.lote.id;

    const r = await registrar_venta({
      key,
      lineas: [{ product_id: sku, qty: 5, precio_centavos: 1000 }],
      medio: "Efectivo",
      deviceCode: `t04atom-${sufijo}`.slice(0, 32),
      seqLocal: 1,
      offline: false,
      clientOccurredAt: "2026-11-06T15:00:00.000Z",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("la venta debió ser rechazada");
    expect(r.codigo).toBe("SIN_STOCK");
    expect(crearAlmacenStock().obtener(sku)).toBe(2);
    expect(crearAlmacenLotes().obtener(loteId)?.cantidadRestante).toBe(2);
    expect(store.stockMoves.filter((m) => m.idemKey === key)).toHaveLength(0);
    expect(store.idempotency.has(key)).toBe(false);
  });
});

describe("AUD-VTA-05 T04 base configurada que falla", () => {
  const ENV = ["TENANT_MODE", "TENANT_DATABASE_URL", "DEFAULT_TENANT_ID"] as const;
  let snap: Record<string, string | undefined> = {};

  beforeEach(() => {
    snap = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    delete process.env.TENANT_MODE;
    process.env.TENANT_DATABASE_URL = "postgres://postgres@127.0.0.1:1/sin_base";
    process.env.DEFAULT_TENANT_ID = "00000000-4000-4000-8000-000000000001";
    resetStore();
  });

  afterEach(() => {
    for (const k of ENV) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
    resetStore();
  });

  it("aplicarMovimiento propaga el fallo y no deja rastro en memoria", async () => {
    const sku = `T04FAIL${sufijo}`;
    const loteId = crypto.randomUUID();
    const key = `t04-fail-mov-${sufijo}`;
    crearAlmacenStock().guardar(sku, 5);
    crearAlmacenLotes().guardar(loteId, { id: loteId, sku, cantidad: 5, cantidadRestante: 5, venceEl: null, costoCentavos: "100" });

    await expect(aplicarMovimiento({ idemKey: key, sku, loteId, delta: -2, tipo: "VENTA" })).rejects.toThrow();

    expect(crearAlmacenStock().obtener(sku)).toBe(5);
    expect(crearAlmacenLotes().obtener(loteId)?.cantidadRestante).toBe(5);
    expect(store.stockMoves.filter((m) => m.idemKey === key)).toHaveLength(0);
  });

  it("crearLote propaga el fallo y no deja rastro en memoria", async () => {
    const sku = `T04FAILLOTE${sufijo}`;
    const key = `t04-fail-lote-${sufijo}`;

    await expect(
      crearLote({ sku, cantidad: 4, venceEl: null, costoCentavos: 100, controlaVencimiento: false, idemKey: key }),
    ).rejects.toThrow();

    expect([...crearAlmacenLotes().comoMapaSoloLectura().values()].some((l) => l.sku === sku)).toBe(false);
    expect(crearAlmacenStock().obtener(sku)).toBeUndefined();
    expect(store.stockMoves.filter((m) => m.idemKey === key)).toHaveLength(0);
  });

  it("registrar_venta propaga el fallo y no confirma la venta en memoria", async () => {
    const sku = `T04FAILVENTA${sufijo}`;
    const key = `t04-fail-venta-${sufijo}`;
    crearAlmacenStock().guardar(sku, 5);

    await expect(
      registrar_venta({
        key,
        lineas: [{ product_id: sku, qty: 2, precio_centavos: 1000 }],
        medio: "Efectivo",
        deviceCode: `t04fail-${sufijo}`.slice(0, 32),
        seqLocal: 1,
        offline: false,
        clientOccurredAt: "2026-11-06T15:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BaseNoDisponible);

    expect(store.idempotency.has(key)).toBe(false);
    expect(crearAlmacenStock().obtener(sku)).toBe(5);
    expect(store.stockMoves.filter((m) => m.idemKey === key)).toHaveLength(0);
  });
});

describe.skipIf(!hayPG)("AUD-VTA-05 T04 el espejo en memoria usa el mismo escritor", () => {
  let basePriv = "";
  const skus: string[] = [];
  const keys: string[] = [];
  const ENV = ["TENANT_MODE", "TENANT_DATABASE_URL_tenant-a"] as const;
  let snap: Record<string, string | undefined> = {};

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("aud_vta_05_t04", process.env.PG_TEST_URL_A ?? "");
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
    for (const k of ENV) delete process.env[k];
  });

  beforeEach(() => {
    snap = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    fijarMulti();
    resetStore();
  });

  afterEach(() => {
    for (const k of ENV) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });

  it("la venta con base deja el mismo Stock, Lote e Historial en la base y en el espejo", async () => {
    const sku = `T04DB${sufijo}`;
    const key = `t04-db-${sufijo}`;
    skus.push(sku);
    keys.push(key);
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(products).values(filaPg({ sku, nombre: sku, precioCentavos: 1000n, stockActual: 10 }));
      const filas = await db
        .insert(stockLots)
        .values(filaPg({ sku, cantidad: 10, cantidadRestante: 10, venceEl: null, costoCentavos: 100n }))
        .returning({ id: stockLots.id });
      const loteId = filas[0]?.id;
      if (!loteId) throw new Error("lote no creado");
      crearAlmacenStock().guardar(sku, 10);
      crearAlmacenLotes().guardar(loteId, { id: loteId, sku, cantidad: 10, cantidadRestante: 10, venceEl: null, costoCentavos: "100" });

      const r = await registrar_venta({
        key,
        lineas: [{ product_id: sku, qty: 3, precio_centavos: 1000 }],
        medio: "Efectivo",
        deviceCode: `t04db-${sufijo}`.slice(0, 32),
        seqLocal: 1,
        offline: false,
        clientOccurredAt: "2026-11-06T15:00:00.000Z",
      });
      expect(r.ok && r.venta.fuente).toBe("db");

      const prod = await db.select({ stock: products.stockActual }).from(products).where(eq(products.sku, sku));
      const lote = await db.select({ restante: stockLots.cantidadRestante }).from(stockLots).where(eq(stockLots.id, loteId));
      expect(prod[0]?.stock).toBe(7);
      expect(lote[0]?.restante).toBe(7);
      expect(crearAlmacenStock().obtener(sku)).toBe(prod[0]?.stock);
      expect(crearAlmacenLotes().obtener(loteId)?.cantidadRestante).toBe(lote[0]?.restante);
      expect(
        store.stockMoves.filter((m) => m.idemKey === key).map((m) => ({ delta: m.delta, loteId: m.loteId, tipo: m.tipo })),
      ).toEqual([{ delta: -3, loteId, tipo: "VENTA" }]);
    });
  });
});
