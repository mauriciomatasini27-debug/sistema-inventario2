import { readFileSync } from "node:fs";
import { ctx } from "./helpers/ctx.js";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { utilityBills } from "../src/db/schema-servicios.js";
import { cashMovements } from "../src/db/schema.js";
import { products } from "../src/db/schema.js";
import { randomUUID } from "node:crypto";
import { customerMovements, customers } from "../src/db/schema-credito.js";
import { POST as postBill } from "../src/pages/api/utility-bills.js";
import { GET as getDue } from "../src/pages/api/utility-bills/due.js";
import { POST as payBill } from "../src/pages/api/utility-bills/pay.js";
import { POST as postSale } from "../src/pages/api/credit/sales-on-account.js";
import { POST as postPayment } from "../src/pages/api/credit/payments.js";
import { GET as getBalance } from "../src/pages/api/credit/balance.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/utility-bills/pay.ts",
  "src/pages/api/utility-bills/due.ts",
  "src/pages/api/utility-bills.ts",
  "src/pages/api/credit/sales-on-account.ts",
  "src/pages/api/credit/payments.ts",
  "src/pages/api/credit/balance.ts",
];

function importaStoreRuntime(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S16/S17 AT12: utility-bills y credit sin store (ADR-0058)", () => {
  it("ninguna de las 6 rutas importa el binding store en runtime (import type y control se permiten)", () => {
    const mal = RUTAS_SIN_STORE.filter(importaStoreRuntime);
    expect(mal).toEqual([]);
  });
});

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
// utility_bills.account_id es uuid en Postgres: el test usa uno fijo valido.
const CUENTA_UUID = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";

function cuerpoFactura(messageId: string, vencimiento = "2026-10-20") {
  return {
    account_id: CUENTA_UUID,
    message_id: messageId,
    periodo: "2026-10",
    vencimiento,
    monto_centavos: 48000,
    origen: "pdf_digital",
  };
}

describe("PERS2-S16 single sin DB: factura, vencimientos y pago como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("alta 201 con bill_id y message repetido 409", async () => {
    const messageId = `pers2-msg-${sufijo}`;
    const r1 = (await postBill(ctx("http://x/api/utility-bills", { body: cuerpoFactura(messageId) }))) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as { bill_id: string; advertencias: unknown };
    expect(typeof j1.bill_id).toBe("string");
    const r2 = (await postBill(ctx("http://x/api/utility-bills", { body: cuerpoFactura(messageId) }))) as Response;
    expect(r2.status).toBe(409);
  });

  it("due expone proximas y vencidas", async () => {
    await postBill(ctx("http://x/api/utility-bills", { body: cuerpoFactura(`pers2-prox-${sufijo}`, "2026-10-12") }));
    await postBill(ctx("http://x/api/utility-bills", { body: cuerpoFactura(`pers2-venc-${sufijo}`, "2026-10-08") }));
    const res = (await getDue(ctx("http://x/api/utility-bills/due?hoy=2026-10-10&dentro_dias=7"))) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as { proximas: Array<Record<string, string>>; vencidas: Array<Record<string, string>> };
    expect(j.proximas.map((f) => f["periodo"])).toEqual(["2026-10"]);
    expect(j.proximas).toHaveLength(1);
    expect(j.vencidas).toHaveLength(1);
    expect(j.proximas[0]).toMatchObject({ account_id: CUENTA_UUID });
  });

  it("pago 200 deja pagada, segundo pago 409 y factura inexistente 404", async () => {
    const messageId = `pers2-pay-${sufijo}`;
    const r1 = (await postBill(ctx("http://x/api/utility-bills", { body: cuerpoFactura(messageId) }))) as Response;
    const billId = ((await r1.json()) as { bill_id: string }).bill_id;
    const pago = { bill_id: billId, servicio: "luz", proveedor: "Edenor", numero_cuenta: "12345", medio: "Debito" };
    const p1 = (await payBill(ctx("http://x/api/utility-bills/pay", { body: pago }))) as Response;
    expect(p1.status).toBe(200);
    expect(await p1.json()).toMatchObject({ bill_id: billId, estado: "pagada" });
    const p2 = (await payBill(ctx("http://x/api/utility-bills/pay", { body: pago }))) as Response;
    expect(p2.status).toBe(409);
    const p3 = (await payBill(
      ctx("http://x/api/utility-bills/pay", { body: { ...pago, bill_id: "bill-inexistente" } }),
    )) as Response;
    expect(p3.status).toBe(404);
  });
});

describe("PERS2-S17 single sin DB: venta a cuenta, cobro y saldo como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("sin base la venta a cuenta no fía y el reintento tampoco", async () => {
    const key = `pers2-vta-${sufijo}`;
    const id = randomUUID();
    const cuerpo = {
      customer_id: id,
      lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 20000 }],
      device_code: "caja-01",
      seq_local: 1,
    };
    const r = (await postSale(ctx("http://x/api/credit/sales-on-account", { body: cuerpo, headers: { "Idempotency-Key": key } }))) as Response;
    expect(r.status).toBe(404);
    const b = (await getBalance(ctx(`http://x/api/credit/balance?customer_id=${id}`))) as Response;
    const j = (await b.json()) as Record<string, unknown>;
    expect(j["saldo_centavos"]).toBe("0");
    expect(j["fuente"]).toBe("memoria");
    const dup = (await postSale(ctx("http://x/api/credit/sales-on-account", { body: cuerpo, headers: { "Idempotency-Key": key } }))) as Response;
    expect(dup.status).toBe(404);
  });

  it("cobro 201 resta haber y balance cuadra", async () => {
    store.creditMovs.push({ customer_id: "cli-2", debe: "20000", haber: "0", key: `pers2-semilla-${sufijo}`, fecha_ms: Date.now() });
    const k2 = `pers2-cob-${sufijo}`;
    const r = (await postPayment(
      ctx("http://x/api/credit/payments", { body: { customer_id: "cli-2", monto_centavos: 8000, medio: "Efectivo" }, headers: { "Idempotency-Key": k2 } }),
    )) as Response;
    expect(r.status).toBe(201);
    const b = (await getBalance(ctx("http://x/api/credit/balance?customer_id=cli-2"))) as Response;
    const j = (await b.json()) as Record<string, unknown>;
    expect(j["saldo_centavos"]).toBe("12000");
    expect(j["estado"]).toBe("al_dia");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

const messagePG = `pers2-svc-${sufijo}@test.local`;
const montoPG = 1000000 + Math.floor(Math.random() * 8999999);
const clientePG = randomUUID();
const skuPG = `pers2svc-${sufijo}`;
const claveVentaPG = `pers2-pg-vta-${sufijo}`;
const claveCobroPG = `pers2-pg-cob-${sufijo}`;
const retiroKeysPG: string[] = [];

async function borrarRastroPG() {
  fijarMulti();
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      for (const key of retiroKeysPG) {
        await db.delete(cashMovements).where(eq(cashMovements.idempotencyKey, key));
      }
      await db.delete(cashMovements).where(eq(cashMovements.idempotencyKey, claveCobroPG));
      await db.delete(customerMovements).where(eq(customerMovements.customerId, clientePG));
      await db.delete(customers).where(eq(customers.id, clientePG));
      await db.delete(products).where(eq(products.sku, skuPG));
      await db.delete(utilityBills).where(eq(utilityBills.messageId, messagePG));
    });
  }
}

describe.skipIf(!hayPG)("PERS2-S16 multi con PG local: factura y pago aislados por tenant", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("cargo y pago una factura en A: queda en la base de A y B no la ve", async () => {
    fijarMulti();
    const alta = await conTenant("tenant-a", () =>
      postBill(ctx("http://x/api/utility-bills", { body: { ...cuerpoFactura(messagePG), monto_centavos: montoPG } })),
    );
    expect((alta as Response).status).toBe(201);
    const altaJson = (await (alta as Response).json()) as { fuente: string; bill_id: string };
    expect(altaJson.fuente).toBe("db");
    const billId = altaJson.bill_id;

    const pago = await conTenant("tenant-a", () =>
      payBill(
        ctx("http://x/api/utility-bills/pay", {
          body: {
            bill_id: billId,
            servicio: "luz",
            proveedor: "Edenor",
            numero_cuenta: "12345",
            medio: "Debito",
          },
        }),
      ),
    );
    expect((pago as Response).status).toBe(200);

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(utilityBills).where(eq(utilityBills.messageId, messagePG));
    });
    expect(filasA.length).toBe(1);
    expect(filasA[0]?.estado).toBe("pagada");
    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(utilityBills).where(eq(utilityBills.messageId, messagePG));
    });
    expect(filasB.length).toBe(0);

    const movsA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db
        .select()
        .from(cashMovements)
        .where(and(eq(cashMovements.origen, "retiro"), eq(cashMovements.montoCentavos, BigInt(montoPG))));
    });
    expect(movsA.length).toBe(1);
    for (const m of movsA) retiroKeysPG.push(m.idempotencyKey);
    const movsB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db
        .select()
        .from(cashMovements)
        .where(and(eq(cashMovements.origen, "retiro"), eq(cashMovements.montoCentavos, BigInt(montoPG))));
    });
    expect(movsB.length).toBe(0);

    const dueB = await conTenant("tenant-b", () =>
      getDue(ctx("http://x/api/utility-bills/due?hoy=2026-10-10&dentro_dias=7")),
    );
    expect((dueB as Response).status).toBe(200);
    const cuerpoB = (await (dueB as Response).json()) as {
      proximas: Array<{ monto_centavos: string }>;
      vencidas: Array<{ monto_centavos: string }>;
    };
    expect([...cuerpoB.proximas, ...cuerpoB.vencidas].filter((f) => f.monto_centavos === String(montoPG))).toHaveLength(
      0,
    );
  });
});

describe.skipIf(!hayPG)("PERS2-S17 multi con PG local: venta a cuenta y cobro aislados por tenant", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("venta y cobro en A: el saldo de A los refleja y B no los ve", async () => {
    fijarMulti();
    const cuerpo = {
      customer_id: clientePG,
      lineas: [{ product_id: skuPG, qty: 1, precio_centavos: 20000 }],
      device_code: "caja-01",
      seq_local: 1,
    };
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(products).values(filaPg({ sku: skuPG, nombre: "Pers2 svc", precioCentavos: 20000n, stockActual: 10 }));
      await getTenantDb().insert(customers).values(filaPg({ id: clientePG, nombre: "Pers2 svc", topeCentavos: 0n })).onConflictDoNothing();
    });
    const venta = await conTenant("tenant-a", () =>
      postSale(ctx("http://x/api/credit/sales-on-account", { body: cuerpo, headers: { "Idempotency-Key": claveVentaPG } })),
    );
    expect((venta as Response).status).toBe(201);
    expect(((await (venta as Response).json()) as { fuente: string }).fuente).toBe("db");

    const cobro = await conTenant("tenant-a", () =>
      postPayment(
        ctx("http://x/api/credit/payments", { body: { customer_id: clientePG, monto_centavos: 8000, medio: "Efectivo" }, headers: { "Idempotency-Key": claveCobroPG } }),
      ),
    );
    expect((cobro as Response).status).toBe(201);
    expect(((await (cobro as Response).json()) as { fuente: string }).fuente).toBe("db");

    const saldoA = await conTenant("tenant-a", () =>
      getBalance(ctx(`http://x/api/credit/balance?customer_id=${clientePG}`)),
    );
    expect((saldoA as Response).status).toBe(200);
    const cuerpoA = (await (saldoA as Response).json()) as Record<string, unknown>;
    expect(cuerpoA["fuente"]).toBe("db");
    expect(cuerpoA["saldo_centavos"]).toBe("12000");

    const saldoB = await conTenant("tenant-b", () =>
      getBalance(ctx(`http://x/api/credit/balance?customer_id=${clientePG}`)),
    );
    expect((saldoB as Response).status).toBe(200);
    const cuerpoB = (await (saldoB as Response).json()) as Record<string, unknown>;
    expect(cuerpoB["fuente"]).toBe("db");
    expect(cuerpoB["saldo_centavos"]).toBe("0");

    const movsA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(customerMovements).where(eq(customerMovements.customerId, clientePG));
    });
    expect(movsA.length).toBe(2);
    const movsB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(customerMovements).where(eq(customerMovements.customerId, clientePG));
    });
    expect(movsB.length).toBe(0);
  });
});
