import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { postSalesSchema } from "../src/lib/validation.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { cashMovements, products, sales, stockMovements, ticketLines, tickets } from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function bodyConAlta(alta: unknown): Record<string, unknown> {
  return {
    lineas: [{ product_id: "STOCK-S2-VAL", qty: 1, precio_centavos: 7000, alta }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: 1,
    client_occurred_at: new Date().toISOString(),
  };
}

describe("STOCK-S2 validación: alta al vuelo en la línea de venta", () => {
  it("acepta alta con nombre y lo recorta", () => {
    const parsed = postSalesSchema.safeParse(bodyConAlta({ nombre: "  Yerba mate  " }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("no parseó");
    expect(parsed.data.lineas[0]?.alta?.nombre).toBe("Yerba mate");
  });

  it("rechaza un nombre vacío o solo espacios", () => {
    expect(postSalesSchema.safeParse(bodyConAlta({ nombre: "   " })).success).toBe(false);
  });

  it("rechaza un nombre de más de 120 caracteres", () => {
    expect(postSalesSchema.safeParse(bodyConAlta({ nombre: "a".repeat(121) })).success).toBe(false);
  });

  it("sin alta la línea vale igual que antes", () => {
    const parsed = postSalesSchema.safeParse({
      lineas: [{ product_id: "demo-sku-1", qty: 2, precio_centavos: 15000 }],
      medio: "Efectivo",
      device_code: "caja-01",
      seq_local: 1,
      client_occurred_at: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("no parseó");
    expect(parsed.data.lineas[0]?.alta).toBeUndefined();
  });
});

function venta(over: {
  readonly product_id: string;
  readonly qty: number;
  readonly precio_centavos: number;
  readonly alta?: { readonly nombre: string };
}) {
  return registrar_venta({
    key: crypto.randomUUID(),
    lineas: [over],
    medio: "Efectivo",
    deviceCode: "caja-01",
    seqLocal: 1,
    offline: false,
    clientOccurredAt: new Date().toISOString(),
  });
}

describe("STOCK-S2 single sin DB: registrar_venta da de alta el producto", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("crea el producto con stock 0 y precio, y registra la línea del ticket", async () => {
    const r = await venta({ product_id: "STOCK-S2-A", qty: 2, precio_centavos: 7000, alta: { nombre: "Yerba mate" } });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("la venta falló");

    expect(store.productos.get("STOCK-S2-A")?.nombre).toBe("Yerba mate");
    expect(store.productos.get("STOCK-S2-A")?.precioCentavos).toBe(7000);
    expect(store.prices.get("STOCK-S2-A")).toBe(7000);
    expect(store.stock.get("STOCK-S2-A")).toBe(0);
    expect(store.ticketLineas).toHaveLength(1);
    expect(store.ticketLineas[0]?.product_id).toBe("STOCK-S2-A");
    expect(store.ticketLineas[0]?.qty).toBe(2);
    expect(store.ticketLineas[0]?.precio_centavos).toBe("7000");
    expect(store.stockMoves).toHaveLength(0);
  });

  it("si el SKU ya existe no pisa nombre ni precio y registra la venta", async () => {
    const r1 = await venta({ product_id: "STOCK-S2-B", qty: 1, precio_centavos: 7000, alta: { nombre: "Original" } });
    expect(r1.ok).toBe(true);
    const r2 = await venta({ product_id: "STOCK-S2-B", qty: 1, precio_centavos: 9999, alta: { nombre: "Pisado" } });
    expect(r2.ok).toBe(true);

    expect(store.productos.get("STOCK-S2-B")?.nombre).toBe("Original");
    expect(store.productos.get("STOCK-S2-B")?.precioCentavos).toBe(7000);
    expect(store.prices.get("STOCK-S2-B")).toBe(7000);
    expect(store.ticketLineas).toHaveLength(2);
  });

  it("un SKU existente con stock normal no se vuelve sobrevendible por mandar alta", async () => {
    store.stock.set("STOCK-S2-N", 1);
    const r = await venta({ product_id: "STOCK-S2-N", qty: 5, precio_centavos: 100, alta: { nombre: "X" } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("debió rechazar");
    expect(r.codigo).toBe("SIN_STOCK");
  });

  it("el provisorio se vende de nuevo sin alta mientras no tenga stock inicial", async () => {
    const r1 = await venta({ product_id: "STOCK-S2-P", qty: 1, precio_centavos: 500, alta: { nombre: "Alfajor" } });
    expect(r1.ok).toBe(true);
    const r2 = await venta({ product_id: "STOCK-S2-P", qty: 3, precio_centavos: 500 });
    expect(r2.ok).toBe(true);
    expect(store.ticketLineas).toHaveLength(2);
  });

  it("una venta rechazada no deja el producto del alta", async () => {
    const r = await registrar_venta({
      key: crypto.randomUUID(),
      lineas: [
        { product_id: "STOCK-S2-C", qty: 1, precio_centavos: 7000, alta: { nombre: "Nuevo" } },
        { product_id: "NO-EXISTE", qty: 1, precio_centavos: 100 },
      ],
      medio: "Efectivo",
      deviceCode: "caja-01",
      seqLocal: 1,
      offline: false,
      clientOccurredAt: new Date().toISOString(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("la venta debía fallar");
    expect(r.codigo).toBe("SIN_STOCK");
    expect(store.productos.has("STOCK-S2-C")).toBe(false);
    expect(store.stock.has("STOCK-S2-C")).toBe(false);
    expect(store.prices.has("STOCK-S2-C")).toBe(false);
    expect(store.ticketLineas).toHaveLength(0);
  });

  it("sin alta la venta se comporta como antes", async () => {
    const r = await venta({ product_id: "demo-sku-1", qty: 2, precio_centavos: 15000 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("la venta falló");

    expect(store.stock.get("demo-sku-1")).toBe(8);
    expect(store.ticketLineas).toHaveLength(1);
    expect(store.productos.has("demo-sku-1")).toBe(false);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 12);

describe.skipIf(!hayPG)("STOCK-S2 multi con PG: products.origen y ticket_lines", () => {
  const sku = `STOCKS2${sufijoPG}`.toUpperCase().slice(0, 32);
  const skuRechazo = `STOCKS2R${sufijoPG}`.toUpperCase().slice(0, 32);
  const device = `stock-s2-${sufijoPG}`.slice(0, 32);
  const keys: string[] = [];
  let basePriv = "";

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  function ventaPG(nombre: string, precioCentavos: number) {
    const key = crypto.randomUUID();
    keys.push(key);
    return conTenant("tenant-a", () =>
      registrar_venta({
        key,
        lineas: [{ product_id: sku, qty: 2, precio_centavos: precioCentavos, alta: { nombre } }],
        medio: "Efectivo",
        deviceCode: device,
        seqLocal: keys.length,
        offline: false,
        clientOccurredAt: new Date().toISOString(),
      }),
    );
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("stock_s2_alta_a", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    if (!basePriv) return;
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const ventas = keys.length > 0 ? await db.select({ id: sales.id }).from(sales).where(inArray(sales.idempotencyKey, keys)) : [];
      const saleIds = ventas.map((v) => v.id);
      if (saleIds.length > 0) {
        await db.delete(ticketDiscounts).where(inArray(ticketDiscounts.saleId, saleIds));
        await db.delete(ticketLines).where(inArray(ticketLines.saleId, saleIds));
        await db.delete(tickets).where(inArray(tickets.saleId, saleIds));
        await db.delete(cashMovements).where(inArray(cashMovements.saleId, saleIds));
        await db.delete(sales).where(inArray(sales.id, saleIds));
      }
      if (keys.length > 0) await db.delete(stockMovements).where(inArray(stockMovements.idemKey, keys));
      await db.delete(products).where(inArray(products.sku, [sku, skuRechazo]));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  it("crea products con origen alta_al_vender, stock 0 y una fila en ticket_lines", async () => {
    fijarMulti();
    const r = await ventaPG("Producto nuevo S2", 7000);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("la venta falló");

    const estado = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const prods = await db.select().from(products).where(eq(products.sku, sku));
      const lineas = await db.select().from(ticketLines).where(eq(ticketLines.saleId, r.venta.saleId));
      const ventas = await db.select().from(sales).where(eq(sales.id, r.venta.saleId));
      return { prods, lineas, ventas };
    });
    expect(estado.prods).toHaveLength(1);
    expect(estado.prods[0]?.origen).toBe("alta_al_vender");
    expect(estado.prods[0]?.nombre).toBe("Producto nuevo S2");
    expect(estado.prods[0]?.precioCentavos).toBe(7000n);
    expect(estado.prods[0]?.stockActual).toBe(0);
    expect(estado.ventas).toHaveLength(1);
    expect(estado.lineas).toHaveLength(1);
    expect(estado.lineas[0]?.productId).toBe(estado.prods[0]?.id);
    expect(estado.lineas[0]?.qty).toBe(2);
  });

  it("un rechazo revierte el alta en la misma transacción", async () => {
    fijarMulti();
    const key = crypto.randomUUID();
    keys.push(key);
    const r = await conTenant("tenant-a", () =>
      registrar_venta({
        key,
        lineas: [
          { product_id: skuRechazo, qty: 1, precio_centavos: 7000, alta: { nombre: "Rechazado" } },
          { product_id: `NOEXISTE${sufijoPG}`, qty: 1, precio_centavos: 100 },
        ],
        medio: "Efectivo",
        deviceCode: device,
        seqLocal: keys.length,
        offline: false,
        clientOccurredAt: new Date().toISOString(),
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("la venta debía fallar");
    expect(r.codigo).toBe("SIN_STOCK");

    const prods = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(products).where(eq(products.sku, skuRechazo));
    });
    expect(prods).toHaveLength(0);
  });

  it("si el SKU ya existe no pisa nombre ni precio y registra la segunda venta", async () => {
    fijarMulti();
    const r = await ventaPG("Pisado", 9999);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("la venta falló");

    const estado = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const prods = await db.select().from(products).where(eq(products.sku, sku));
      const lineas = await db.select().from(ticketLines).where(eq(ticketLines.saleId, r.venta.saleId));
      return { prods, lineas };
    });
    expect(estado.prods).toHaveLength(1);
    expect(estado.prods[0]?.nombre).toBe("Producto nuevo S2");
    expect(estado.prods[0]?.precioCentavos).toBe(7000n);
    expect(estado.prods[0]?.stockActual).toBe(0);
    expect(estado.lineas).toHaveLength(1);
  });

  it("el provisorio se vende sin alta mientras no tenga movimiento ALTA", async () => {
    fijarMulti();
    const key = crypto.randomUUID();
    keys.push(key);
    const r = await conTenant("tenant-a", () =>
      registrar_venta({
        key,
        lineas: [{ product_id: sku, qty: 4, precio_centavos: 7000 }],
        medio: "Efectivo",
        deviceCode: device,
        seqLocal: keys.length,
        offline: false,
        clientOccurredAt: new Date().toISOString(),
      }),
    );
    expect(r.ok).toBe(true);
  });
});
