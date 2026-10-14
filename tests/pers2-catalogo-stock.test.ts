import { readFileSync } from "node:fs";
import { ctx } from "./helpers/ctx.js";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, stockMovements } from "../src/db/schema.js";
import { purchaseOrders, purchaseOrderLines } from "../src/db/schema-proveedores.js";
import { GET as getProducts, POST as postProducts, PATCH as patchProducts } from "../src/pages/api/products.js";
import { GET as getLocations, POST as postLocations } from "../src/pages/api/locations.js";
import { GET as getLots, POST as postLots } from "../src/pages/api/lots.js";
import { POST as postCounts, PATCH as patchCounts } from "../src/pages/api/counts.js";
import { POST as postConteo } from "../src/pages/api/stock/conteo.js";
import { POST as postOrder } from "../src/pages/api/purchase-orders.js";
import { POST as postClose } from "../src/pages/api/purchase-orders/close.js";
import { POST as postPayee } from "../src/pages/api/payees.js";
import { GET as getAccounts, POST as postAccounts } from "../src/pages/api/service-accounts.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/products.ts",
  "src/pages/api/locations.ts",
  "src/pages/api/lots.ts",
  "src/pages/api/counts.ts",
  "src/pages/api/stock/conteo.ts",
  "src/pages/api/purchase-orders.ts",
  "src/pages/api/purchase-orders/close.ts",
  "src/pages/api/payees.ts",
  "src/pages/api/service-accounts.ts",
];

function importaStoreValores(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S23/S24 AT16: catalogo, stock y compras sin valores de lib/store (ADR-0062)", () => {
  it("ninguna de las 9 rutas importa valores de lib/store (import type y control permitidos)", () => {
    const mal = RUTAS_SIN_STORE.filter(importaStoreValores);
    expect(mal).toEqual([]);
  });
});

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function req(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const CUIT = "20-93333172-6";

function cuerpoOrden() {
  return {
    supplier_cuit: CUIT,
    lineas: [{ sku: "yerba", qty: 10, costo_centavos: 1648000 }],
    creado_por: "d",
  };
}

describe("PERS2-S23 single sin DB: catalogo y stock como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("productos: alta 201, duplicado 409 y busqueda", async () => {
    const r1 = (await postProducts({
      request: req("http://x/api/products", { sku: "YERBA-1", nombre: "Yerba", precio_centavos: 5000, codigo: "779123" }),
    } as never)) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await postProducts({
      request: req("http://x/api/products", { sku: "YERBA-1", nombre: "Otra", precio_centavos: 1 }),
    } as never)) as Response;
    expect(r2.status).toBe(409);
    const g = (await getProducts(ctx("http://x/api/products?q=yerba"))) as Response;
    expect(((await g.json()) as { productos: unknown[] }).productos.length).toBe(1);
    const gc = (await getProducts(ctx("http://x/api/products?codigo=779123"))) as Response;
    expect(((await gc.json()) as { productos: unknown[] }).productos.length).toBe(1);
    const p = (await patchProducts({
      request: req("http://x/api/products", { nombre: "Yerba Nueva" }),
      url: new URL("http://x/api/products?sku=YERBA-1"),
    } as never)) as Response;
    expect(p.status).toBe(200);
    expect(((await p.json()) as { nombre: string }).nombre).toBe("Yerba Nueva");
  });

  it("ubicaciones: alta 201 y duplicado 409 sin importar mayusculas", async () => {
    const a = (await postLocations({ request: req("http://x/api/locations", { nombre: "Deposito" }) } as never)) as Response;
    expect(a.status).toBe(201);
    const b = (await postLocations({ request: req("http://x/api/locations", { nombre: "deposito" }) } as never)) as Response;
    expect(b.status).toBe(409);
    const g = (await getLocations(ctx("http://x/api/locations"))) as Response;
    expect(((await g.json()) as { ubicaciones: unknown[] }).ubicaciones.length).toBe(1);
  });

  it("lotes: controla_vencimiento sin fecha 422 y FEFO ordenado", async () => {
    const r422 = (await postLots({
      request: req("http://x/api/lots", { sku: "LECHE", cantidad: 5, controla_vencimiento: true }),
    } as never)) as Response;
    expect(r422.status).toBe(422);
    await postLots({
      request: req("http://x/api/lots", { sku: "LECHE", cantidad: 5, vence_el: new Date(Date.now() + 10 * 86400_000).toISOString() }),
    } as never);
    await postLots({
      request: req("http://x/api/lots", { sku: "LECHE", cantidad: 5, vence_el: new Date(Date.now() + 2 * 86400_000).toISOString() }),
    } as never);
    const g = (await getLots(ctx("http://x/api/lots?sku=LECHE"))) as Response;
    const j = (await g.json()) as { lotes: Array<{ venceEl: string }> };
    expect(j.lotes.length).toBe(2);
    expect(j.lotes[0]!.venceEl < j.lotes[1]!.venceEl).toBe(true);
  });

  it("conteos: crear 201 y confirmar de dueno ajusta stock", async () => {
    await postLots({ request: req("http://x/api/lots", { sku: "YERBA-1", cantidad: 10 }) } as never);
    const c = (await postCounts({
      request: req("http://x/api/counts", { contado_por: "emp", lineas: [{ sku: "YERBA-1", fisico: 8 }] }, { "Idempotency-Key": "k1" }),
    } as never)) as Response;
    expect(c.status).toBe(201);
    const cj = (await c.json()) as { id: string };
    const p = (await patchCounts({
      request: req("http://x/api/counts", { rol: "dueno", confirmado_por: "due", motivo: "ajuste" }),
      url: new URL(`http://x/api/counts?id=${cj.id}`),
    } as never)) as Response;
    expect(p.status).toBe(200);
    expect(store.stock.get("YERBA-1")).toBe(8);
  });

  it("stock/conteo: 201 con diferencias y key repetida 409", async () => {
    await postLots({ request: req("http://x/api/lots", { sku: "CONTEO-1", cantidad: 10 }) } as never);
    const r1 = (await postConteo({
      request: req("http://x/api/stock/conteo", { sector: "general", lineas: [{ sku: "CONTEO-1", fisico: 7 }] }, { "Idempotency-Key": "sc-1" }),
    } as never)) as Response;
    expect(r1.status).toBe(201);
    expect(((await r1.json()) as { movimientos: number }).movimientos).toBe(1);
    const r2 = (await postConteo({
      request: req("http://x/api/stock/conteo", { sector: "general", lineas: [{ sku: "CONTEO-1", fisico: 7 }] }, { "Idempotency-Key": "sc-1" }),
    } as never)) as Response;
    expect(r2.status).toBe(409);
  });
});

describe("PERS2-S24 single sin DB: compras y cuentas como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("orden de compra: alta 201, key repetida 409 y cierre 200", async () => {
    const o1 = (await postOrder({ request: req("http://x/api/purchase-orders", cuerpoOrden(), { "Idempotency-Key": "oc-t1" }) } as never)) as Response;
    expect(o1.status).toBe(201);
    const j1 = (await o1.json()) as { order_id: string; total_centavos: string };
    expect(j1.total_centavos).toBe("16480000");
    const o2 = (await postOrder({ request: req("http://x/api/purchase-orders", cuerpoOrden(), { "Idempotency-Key": "oc-t1" }) } as never)) as Response;
    expect(o2.status).toBe(409);
    const orderId = j1.order_id ?? `oc-oc-t1`;
    const c = (await postClose({ request: req("http://x/api/purchase-orders/close", { order_id: orderId, quien: "d" }) } as never)) as Response;
    expect(c.status).toBe(200);
    expect(((await c.json()) as { estado: string }).estado).toBe("cerrada");
  });

  it("payees: alta 201 y alias repetido 409", async () => {
    const b1 = { nombre: "Distribuidora X SRL", tipo: "proveedor", medio_preferido: "Transferencia", alias: "distri.x.pagos" };
    const r1 = (await postPayee({ request: req("http://x/api/payees", b1) } as never)) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await postPayee({
      request: req("http://x/api/payees", { ...b1, nombre: "Otra razon social" }),
    } as never)) as Response;
    expect(r2.status).toBe(409);
  });

  it("service-accounts: alta 201, duplicada 409 y GET lista", async () => {
    const cuerpo = { servicio: "luz", proveedor: "Edenor", titular: "Kiosco Centro", numero_cuenta: "12345" };
    const r1 = (await postAccounts({ request: req("http://x/api/service-accounts", cuerpo) } as never)) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await postAccounts({ request: req("http://x/api/service-accounts", cuerpo) } as never)) as Response;
    expect(r2.status).toBe(409);
    const g = (await getAccounts(ctx("http://x/api/service-accounts"))) as Response;
    const j = (await g.json()) as { items: Array<Record<string, unknown>> };
    expect(j.items).toHaveLength(1);
    expect(j.items[0]).toMatchObject({ servicio: "luz", proveedor: "Edenor", activa: true });
    expect(j.items[0]).not.toHaveProperty("email_origen");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("PERS2-S23/S24 multi con PG local: ordenes y stock aislados por tenant", () => {
  const ordenKey = `pers2-cs-oc-${sufijoPG}`;
  const loteKey = `pers2-cs-lote-${sufijoPG}`;
  const conteoKey = `pers2-cs-conteo-${sufijoPG}`;
  const skuPG = `CS-${sufijoPG}`.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);

  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.delete(stockMovements).where(eq(stockMovements.idemKey, loteKey));
        await db.delete(stockMovements).where(eq(stockMovements.idemKey, conteoKey));
        const { stockLots, productCodes } = await import("../src/db/schema.js");
        await db.delete(stockLots).where(eq(stockLots.sku, skuPG));
        await db.delete(productCodes).where(eq(productCodes.sku, skuPG));
        await db.delete(products).where(eq(products.sku, skuPG));
        const ordenes = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.idempotencyKey, ordenKey));
        for (const o of ordenes) {
          await db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, o.id));
        }
        await db.delete(purchaseOrders).where(eq(purchaseOrders.idempotencyKey, ordenKey));
      });
    }
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("orden creada y cerrada en A queda en purchase_orders de A y B no la ve", async () => {
    fijarMulti();
    const r1 = await conTenant("tenant-a", () =>
      postOrder({ request: req("http://x/api/purchase-orders", cuerpoOrden(), { "Idempotency-Key": ordenKey }) } as never),
    );
    expect((r1 as Response).status).toBe(201);
    const jr1 = (await (r1 as Response).json()) as { order_id?: string; fuente?: string };
    expect(jr1.fuente).toBe("db");
    const orderId = jr1.order_id ?? `oc-${ordenKey}`;
    const rc = await conTenant("tenant-a", () =>
      postClose({ request: req("http://x/api/purchase-orders/close", { order_id: orderId, quien: "d" }) } as never),
    );
    expect((rc as Response).status).toBe(200);
    expect(((await (rc as Response).json()) as { estado: string }).estado).toBe("cerrada");
    const filasA = await conTenant("tenant-a", async () =>
      getTenantDb().select().from(purchaseOrders).where(eq(purchaseOrders.idempotencyKey, ordenKey)),
    );
    expect(filasA.length).toBe(1);
    expect(filasA[0]!.estado).toBe("cerrada");
    const filasB = await conTenant("tenant-b", async () =>
      getTenantDb().select().from(purchaseOrders).where(eq(purchaseOrders.idempotencyKey, ordenKey)),
    );
    expect(filasB.length).toBe(0);
  });

  it("movimiento de stock de A (lote + conteo) no es visible en B", async () => {
    fijarMulti();
    const rp = await conTenant("tenant-a", () =>
      postProducts({ request: req("http://x/api/products", { sku: skuPG, nombre: "Producto CS", precio_centavos: 1000 }) } as never),
    );
    expect((rp as Response).status).toBe(201);
    const rl = await conTenant("tenant-a", () =>
      postLots({ request: req("http://x/api/lots", { sku: skuPG, cantidad: 10 }, { "Idempotency-Key": loteKey }) } as never),
    );
    expect((rl as Response).status).toBe(201);
    const movsA = await conTenant("tenant-a", async () =>
      getTenantDb().select().from(stockMovements).where(eq(stockMovements.idemKey, loteKey)),
    );
    expect(movsA.length).toBe(1);
    const movsB = await conTenant("tenant-b", async () =>
      getTenantDb().select().from(stockMovements).where(eq(stockMovements.idemKey, loteKey)),
    );
    expect(movsB.length).toBe(0);
    const rcp = await conTenant("tenant-a", () =>
      postConteo({
        request: req("http://x/api/stock/conteo", { sector: "general", lineas: [{ sku: skuPG, fisico: 7 }] }, { "Idempotency-Key": conteoKey }),
      } as never),
    );
    expect((rcp as Response).status).toBe(201);
    const compA = await conTenant("tenant-a", async () =>
      getTenantDb().select().from(stockMovements).where(eq(stockMovements.idemKey, conteoKey)),
    );
    expect(compA.length).toBe(1);
    const compB = await conTenant("tenant-b", async () =>
      getTenantDb().select().from(stockMovements).where(eq(stockMovements.idemKey, conteoKey)),
    );
    expect(compB.length).toBe(0);
  });
});
