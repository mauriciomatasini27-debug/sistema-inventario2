import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { customerMovements, customers } from "../src/db/schema-credito.js";
import { idMappings, outbox, products, sales, ticketCounters, tickets } from "../src/db/schema.js";
import { saleReturns } from "../src/db/schema-tickets.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { POST as postReturns } from "../src/pages/api/returns.js";
import { POST as postCuenta } from "../src/pages/api/credit/sales-on-account.js";
import { POST as postPush } from "../src/pages/api/sync/push.js";
import { POST as postPromote } from "../src/pages/api/sync/promote.js";
import { ctx } from "./helpers/ctx.js";

const suf = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function ventaBody(over: Record<string, unknown> = {}) {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: 1,
    client_occurred_at: new Date().toISOString(),
    offline: false,
    ...over,
  };
}

function devolucionBody(saleId: string, monto: number, over: Record<string, unknown> = {}) {
  return {
    sale_id: saleId,
    monto_centavos: monto,
    items: [{ product_id: "demo-sku-1", qty: 1 }],
    medio: "Efectivo",
    motivo: "cliente arrepentido",
    actor: "dueno",
    client_occurred_at: new Date().toISOString(),
    ...over,
  };
}

function cuentaBody(over: Record<string, unknown> = {}) {
  return {
    customer_id: randomUUID(),
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 20000 }],
    device_code: "caja-01",
    seq_local: 1,
    ...over,
  };
}

function numT(t: string): number {
  return Number(t.slice(2));
}

function numD(d: string): number {
  return Number(d.slice(2));
}

describe("PERS5 single sin DB: devoluciones y venta a cuenta como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("dos devoluciones dan D-000001 y D-000002", async () => {
    const v = await postSales(
      ctx("http://x/api/sales", { headers: { "Idempotency-Key": `p5-v-${suf}` }, body: ventaBody() }),
    );
    expect(v.status).toBe(201);
    const saleId = ((await v.json()) as { sale_id: string }).sale_id;

    const d1 = await postReturns(
      ctx("http://x/api/returns", { headers: { "Idempotency-Key": `p5-d1-${suf}` }, body: devolucionBody(saleId, 5000) }),
    );
    const d2 = await postReturns(
      ctx("http://x/api/returns", { headers: { "Idempotency-Key": `p5-d2-${suf}` }, body: devolucionBody(saleId, 4000) }),
    );
    expect(d1.status).toBe(201);
    expect(d2.status).toBe(201);
    expect(((await d1.json()) as { numero_devolucion: string }).numero_devolucion).toBe("D-000001");
    expect(((await d2.json()) as { numero_devolucion: string }).numero_devolucion).toBe("D-000002");
  });

  it("sin base la venta a cuenta no consume el correlativo del mostrador", async () => {
    const c = await postCuenta(
      ctx("http://x/api/credit/sales-on-account", { headers: { "Idempotency-Key": `p5-c-${suf}` }, body: cuentaBody() }),
    );
    expect(c.status).toBe(404);
    const v = await postSales(
      ctx("http://x/api/sales", { headers: { "Idempotency-Key": `p5-vc-${suf}` }, body: ventaBody() }),
    );
    expect(v.status).toBe(201);
    const ticketV = ((await v.json()) as { ticket_definitivo: string }).ticket_definitivo;
    expect(ticketV).toBe("T-000001");
    expect(store.nextTicket).toBe(2);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function contador(tenant: "tenant-a" | "tenant-b", serie: string): Promise<number | null> {
  return conTenant(tenant, async () => {
    const db = getTenantDb();
    const filas = await db.select().from(ticketCounters).where(eq(ticketCounters.id, serie)).limit(1);
    return filas[0]?.ultimo ?? null;
  });
}

describe.skipIf(!hayPG)("PERS5 multi con PG local: correlativos D-* y T-* en la base", () => {
  const sku = `p5-sku-${suf}`;
  const ventaDev = randomUUID();
  const devKey0 = `p5-dev-${suf}-0`;
  const devKeys = [0, 1, 2, 3, 4].map((i) => `p5-dev-${suf}-${i}`);
  const devNums: string[] = [];
  const ventaKey = `p5-pg-v-${suf}`;
  const cuentaKey = `p5-pg-c-${suf}`;
  const cuentaKey2 = `p5-pg-c2-${suf}`;
  const cliente = randomUUID();
  const opId = randomUUID();
  const device = `p5-caja-${suf}`.slice(0, 32);
  const ticketsT: string[] = [];

  beforeAll(async () => {
    fijarMulti();
    resetStore();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.execute(
        sql`insert into products (sku, nombre, precio_centavos, stock_actual) values (${sku}, 'PERS5 PG', 15000, 100) on conflict (sku) do nothing`,
      );
      await db
        .insert(sales)
        .values({ id: ventaDev, idempotencyKey: `p5-sem-${suf}`, medio: "Efectivo", totalCentavos: 15000n, clientOccurredAt: new Date() })
        .onConflictDoNothing();
      await db.insert(ticketCounters).values({ id: "mostrador", ultimo: 0 }).onConflictDoNothing();
      await db.insert(ticketCounters).values({ id: "devolucion", ultimo: 0 }).onConflictDoNothing();
      await db.insert(customers).values({ id: cliente, nombre: "PERS5 fiado", topeCentavos: 0n }).onConflictDoNothing();
    });
    await conTenant("tenant-a", () => {
      store.nextTicket = 1;
    });
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(saleReturns).where(eq(saleReturns.saleId, ventaDev));
      const ventas = await db.select().from(sales).where(eq(sales.idempotencyKey, ventaKey));
      for (const f of ventas) {
        await db.delete(tickets).where(eq(tickets.saleId, f.id));
      }
      await db.delete(sales).where(eq(sales.idempotencyKey, ventaKey));
      await db.delete(sales).where(eq(sales.id, ventaDev));
      await db.delete(customerMovements).where(eq(customerMovements.customerId, cliente));
      await db.delete(customers).where(eq(customers.id, cliente));
      await db.delete(outbox).where(eq(outbox.opId, opId));
      await db.delete(idMappings).where(eq(idMappings.opId, opId));
      await db.delete(products).where(eq(products.sku, sku));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("(a) 5 devoluciones concurrentes: 201, números distintos, contador de A avanza, B sin filas", async () => {
    fijarMulti();
    const antesA = (await contador("tenant-a", "devolucion")) ?? 0;
    const resps = await Promise.all(
      devKeys.map((key) =>
        conTenant("tenant-a", () =>
          postReturns(ctx("http://x/api/returns", { headers: { "Idempotency-Key": key }, body: devolucionBody(ventaDev, 1000) })),
        ),
      ),
    );
    const statuses = resps.map((r) => (r as Response).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201]);
    for (const r of resps) {
      const j = ((await (r as Response).json()) as { numero_devolucion: string });
      expect(j.numero_devolucion).toMatch(/^D-\d{6}$/);
      devNums.push(j.numero_devolucion);
    }
    expect(new Set(devNums).size).toBe(5);
    const despuesA = (await contador("tenant-a", "devolucion")) ?? 0;
    // Relativo: la base A se comparte con otros archivos en paralelo, así que
    // un escritor ajeno puede inflar el delta; lo propio queda probado con
    // 5×201 + distintos + cada número dentro de la ventana del contador.
    expect(despuesA - antesA).toBeGreaterThanOrEqual(5);
    for (const n of devNums.map(numD)) {
      expect(n).toBeGreaterThan(antesA);
      expect(n).toBeLessThanOrEqual(despuesA);
    }
    // Aislamiento por fila (inmune al contador): ninguna de las 5 claves
    // existe en sale_returns de B.
    const enB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(saleReturns).where(inArray(saleReturns.idempotencyKey, devKeys));
    });
    expect(enB).toEqual([]);
  });

  it("(b) misma clave de devolución: 409 con el número original", async () => {
    fijarMulti();
    const r = await conTenant("tenant-a", () =>
      postReturns(ctx("http://x/api/returns", { headers: { "Idempotency-Key": devKey0 }, body: devolucionBody(ventaDev, 1000) })),
    );
    expect((r as Response).status).toBe(409);
    const j = ((await (r as Response).json()) as { original: { numero_devolucion: string } });
    expect(j.original.numero_devolucion).toBe(devNums[0]);
  });

  it("(c) tras resetStore la devolución sigue el correlativo de la base", async () => {
    fijarMulti();
    resetStore();
    const r = await conTenant("tenant-a", () =>
      postReturns(ctx("http://x/api/returns", { headers: { "Idempotency-Key": `p5-dev-reset-${suf}` }, body: devolucionBody(ventaDev, 1000) })),
    );
    expect((r as Response).status).toBe(201);
    const numero = ((await (r as Response).json()) as { numero_devolucion: string }).numero_devolucion;
    expect(devNums).not.toContain(numero);
    expect(numD(numero)).toBeGreaterThan(Math.max(...devNums.map(numD)));
  });

  it("(d) venta + promote + venta a cuenta: T-* distintos y crecientes, sin repetir tras reset", async () => {
    fijarMulti();
    const v = await conTenant("tenant-a", () =>
      postSales(
        ctx("http://x/api/sales", {
          headers: { "Idempotency-Key": ventaKey },
          body: ventaBody({ lineas: [{ product_id: sku, qty: 1, precio_centavos: 15000 }] }),
        }),
      ),
    );
    expect((v as Response).status).toBe(201);
    const ticketV = ((await (v as Response).json()) as { ticket_definitivo: string }).ticket_definitivo;
    ticketsT.push(ticketV);

    const push = await conTenant("tenant-a", () =>
      postPush(
        ctx("http://x/api/sync/push", {
          headers: { "Idempotency-Key": opId },
          body: {
            op_id: opId,
            device_code: device,
            device_seq: 1,
            hlc: `${Date.now()}:1`,
            modulo: "sales",
            payload: { total: 15000 },
            client_occurred_at: new Date().toISOString(),
          },
        }),
      ),
    );
    expect((push as Response).status).toBe(201);
    const pr = await conTenant("tenant-a", () =>
      postPromote(
        ctx("http://x/api/sync/promote", {
          headers: { "Idempotency-Key": opId },
          body: { op_id: opId, device_code: device, device_seq: 1 },
        }),
      ),
    );
    expect((pr as Response).status).toBe(201);
    ticketsT.push(((await (pr as Response).json()) as { ticket_definitivo: string }).ticket_definitivo);

    const c = await conTenant("tenant-a", () =>
      postCuenta(
        ctx("http://x/api/credit/sales-on-account", {
          headers: { "Idempotency-Key": cuentaKey },
          body: cuentaBody({
            customer_id: cliente,
            lineas: [{ product_id: sku, qty: 1, precio_centavos: 20000 }],
          }),
        }),
      ),
    );
    expect((c as Response).status).toBe(201);
    ticketsT.push(((await (c as Response).json()) as { ticket_definitivo: string }).ticket_definitivo);

    for (const t of ticketsT) expect(t).toMatch(/^T-\d{6}$/);
    expect(new Set(ticketsT).size).toBe(3);
    const nums = ticketsT.map(numT);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    expect(await contador("tenant-a", "mostrador")).toBeGreaterThanOrEqual(Math.max(...nums));

    resetStore();
    const c2 = await conTenant("tenant-a", () =>
      postCuenta(
        ctx("http://x/api/credit/sales-on-account", {
          headers: { "Idempotency-Key": cuentaKey2 },
          body: cuentaBody({
            customer_id: cliente,
            lineas: [{ product_id: sku, qty: 1, precio_centavos: 20000 }],
          }),
        }),
      ),
    );
    expect((c2 as Response).status).toBe(201);
    const ticket2 = ((await (c2 as Response).json()) as { ticket_definitivo: string }).ticket_definitivo;
    expect(ticketsT).not.toContain(ticket2);
    expect(numT(ticket2)).toBeGreaterThan(Math.max(...nums));
  });
});
