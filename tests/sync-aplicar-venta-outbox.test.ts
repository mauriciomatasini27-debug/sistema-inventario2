import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import {
  cashMovements,
  idMappings,
  outbox,
  products,
  sales,
  stockMovements,
  ticketLines,
  ticketPayments,
  tickets,
} from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { aplicarVentaOutbox } from "../src/modules/sync/aplicar-venta-outbox.js";
import { POST as POSTPush } from "../src/pages/api/sync/push.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function payloadVenta(seq: number): Record<string, unknown> {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 2, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: seq,
    client_occurred_at: new Date().toISOString(),
  };
}

function pushCtx(opId: string, seq: number, payload: Record<string, unknown>, modulo = "sales") {
  return ctx("http://localhost/api/sync/push", {
    body: {
      op_id: opId,
      device_code: "caja-01",
      device_seq: seq,
      hlc: `${Date.now()}:${seq}`,
      modulo,
      payload,
      client_occurred_at: new Date().toISOString(),
    },
    headers: { "Idempotency-Key": opId },
  });
}

describe("P10-6 single sin DB: aplicarVentaOutbox", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("aplica la venta offline, descuenta stock y no asigna ticket definitivo", async () => {
    const opId = crypto.randomUUID();
    const r = await aplicarVentaOutbox({ opId, payload: payloadVenta(1) });
    expect(r.resultado).toBe("aplicada");
    if (r.resultado !== "aplicada") throw new Error("resultado inesperado");
    expect(r.saleId).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.stock.get("demo-sku-1")).toBe(8);
    expect(store.idempotency.get(opId)?.ticket_definitivo).toBeNull();
    expect(store.ticketLineas).toHaveLength(1);
  });

  it("repetir el mismo op_id devuelve ya_aplicada sin duplicar venta ni stock", async () => {
    const opId = crypto.randomUUID();
    const payload = payloadVenta(1);
    expect((await aplicarVentaOutbox({ opId, payload })).resultado).toBe("aplicada");
    expect((await aplicarVentaOutbox({ opId, payload })).resultado).toBe("ya_aplicada");
    expect(store.stock.get("demo-sku-1")).toBe(8);
    expect(store.idempotency.size).toBe(1);
    expect(store.ticketLineas).toHaveLength(1);
    expect(store.movements).toHaveLength(1);
  });

  it("payload inválido devuelve no_aplicable y no escribe nada", async () => {
    const r = await aplicarVentaOutbox({ opId: crypto.randomUUID(), payload: { lineas: [] } });
    expect(r).toEqual({ resultado: "no_aplicable" });
    expect(store.idempotency.size).toBe(0);
    expect(store.ticketLineas).toHaveLength(0);
    expect(store.stock.get("demo-sku-1")).toBe(10);
  });
});

describe("P10-6 push de venta: aplica, descuenta stock y el replay no duplica", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("push sales aplica la venta y el replay responde ya_aplicada", async () => {
    const opId = crypto.randomUUID();
    const payload = payloadVenta(1);
    const r1 = (await POSTPush(pushCtx(opId, 1, payload))) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1["venta"]).toBe("aplicada");
    expect(typeof j1["sale_id"]).toBe("string");
    expect(store.stock.get("demo-sku-1")).toBe(8);

    const r2 = (await POSTPush(pushCtx(opId, 1, payload))) as Response;
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as Record<string, unknown>;
    expect(j2["venta"]).toBe("ya_aplicada");
    expect(store.stock.get("demo-sku-1")).toBe(8);
    expect(store.idempotency.size).toBe(1);
    expect(store.ticketLineas).toHaveLength(1);
  });

  it("payload inválido responde no_aplicable y la op queda guardada en outbox", async () => {
    const opId = crypto.randomUUID();
    const r = (await POSTPush(pushCtx(opId, 1, { lineas: [] }))) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as Record<string, unknown>)["venta"]).toBe("no_aplicable");
    expect(store.outbox.has(opId)).toBe(true);
  });

  it("un módulo distinto de sales no llama al aplicador", async () => {
    const r = (await POSTPush(pushCtx(crypto.randomUUID(), 1, { sku: "demo-sku-1" }, "inventory"))) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as Record<string, unknown>;
    expect("venta" in j).toBe(false);
    expect(store.stock.get("demo-sku-1")).toBe(10);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);

let basePriv = "";

describe.skipIf(!hayPG)("P10-6 multi con PG local: la venta queda aplicada y el replay no duplica", () => {
  const skuPG = `SYNAPL${sufijoPG}`.toUpperCase().slice(0, 32);
  const devicePG = `sync-apl-${sufijoPG}`.slice(0, 32);
  const opPG = crypto.randomUUID();
  let saleIdPG = "";
  let productIdPG = "";

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  function pushPG(seq: number, payload: Record<string, unknown>) {
    return ctx("http://localhost/api/sync/push", {
      body: {
        op_id: opPG,
        device_code: devicePG,
        device_seq: seq,
        hlc: `${Date.now()}:${seq}`,
        modulo: "sales",
        payload,
        client_occurred_at: new Date().toISOString(),
      },
      headers: { "Idempotency-Key": opPG },
    });
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("sync_apl1_a", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
    const fila = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const ins = await db
        .insert(products)
        .values({ sku: skuPG, nombre: "Producto P10-6", precioCentavos: 15000n, stockActual: 10 })
        .returning({ id: products.id });
      return ins[0]?.id ?? "";
    });
    productIdPG = fila;
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      if (saleIdPG) {
        await db.delete(ticketDiscounts).where(eq(ticketDiscounts.saleId, saleIdPG));
        await db.delete(ticketLines).where(eq(ticketLines.saleId, saleIdPG));
        await db.delete(ticketPayments).where(eq(ticketPayments.saleId, saleIdPG));
        await db.delete(tickets).where(eq(tickets.saleId, saleIdPG));
        await db.delete(cashMovements).where(eq(cashMovements.saleId, saleIdPG));
        await db.delete(stockMovements).where(eq(stockMovements.idemKey, opPG));
        await db.delete(sales).where(eq(sales.id, saleIdPG));
      }
      await db.delete(outbox).where(eq(outbox.opId, opPG));
      await db.delete(idMappings).where(eq(idMappings.opId, opPG));
      if (productIdPG) await db.delete(products).where(eq(products.id, productIdPG));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  it("push aplica sale, ticket_lines y stock_movements; replay no duplica", async () => {
    fijarMulti();
    const payload = {
      lineas: [{ product_id: skuPG, qty: 2, precio_centavos: 15000 }],
      medio: "Efectivo",
      device_code: devicePG,
      seq_local: 1,
      client_occurred_at: new Date().toISOString(),
    };
    const r1 = (await conTenant("tenant-a", () => POSTPush(pushPG(1, payload)))) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1["venta"]).toBe("aplicada");
    saleIdPG = String(j1["sale_id"]);

    const estado = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const ventas = await db.select().from(sales).where(eq(sales.id, saleIdPG));
      const lineas = await db.select().from(ticketLines).where(eq(ticketLines.saleId, saleIdPG));
      const movs = await db.select().from(stockMovements).where(eq(stockMovements.idemKey, opPG));
      const prods = await db.select().from(products).where(eq(products.id, productIdPG));
      const tk = await db.select().from(tickets).where(eq(tickets.saleId, saleIdPG));
      return { ventas, lineas, movs, prods, tk };
    });
    expect(estado.ventas).toHaveLength(1);
    expect(estado.ventas[0]?.offline).toBe(true);
    expect(estado.lineas).toHaveLength(1);
    expect(estado.movs).toHaveLength(1);
    expect(estado.prods[0]?.stockActual).toBe(8);
    expect(estado.tk[0]?.definitivo).toBeNull();

    const r2 = (await conTenant("tenant-a", () => POSTPush(pushPG(1, payload)))) as Response;
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as Record<string, unknown>)["venta"]).toBe("ya_aplicada");

    const despues = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const ventas = await db.select().from(sales).where(eq(sales.id, saleIdPG));
      const prods = await db.select().from(products).where(eq(products.id, productIdPG));
      const movs = await db.select().from(stockMovements).where(eq(stockMovements.idemKey, opPG));
      return { ventas, prods, movs };
    });
    expect(despues.ventas).toHaveLength(1);
    expect(despues.prods[0]?.stockActual).toBe(8);
    expect(despues.movs).toHaveLength(1);
  });
});
