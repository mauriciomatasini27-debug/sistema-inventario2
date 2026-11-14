import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";
import { resetStore } from "../src/lib/store.js";
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
import { POST as POSTPush } from "../src/pages/api/sync/push.js";
import { POST as POSTPromote } from "../src/pages/api/sync/promote.js";
import { GET as GETTickets } from "../src/pages/api/tickets.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A);

describe.skipIf(!hayPG)("P1-71 promote completa tickets.definitivo", () => {
  const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
  const sku = `P171${sufijo}`.toUpperCase().slice(0, 32);
  const device = `p171-${sufijo}`.slice(0, 32);
  const opId = crypto.randomUUID();
  let basePriv = "";
  let saleId = "";

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  function payload() {
    return {
      lineas: [{ product_id: sku, qty: 1, precio_centavos: 15000 }],
      medio: "Efectivo",
      device_code: device,
      seq_local: 1,
      client_occurred_at: new Date().toISOString(),
      offline: true,
    };
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("p1_71_definitivo", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(products).values(
        filaPg({
          sku,
          nombre: "Producto P1-71",
          precioCentavos: 15000n,
          stockActual: 10,
        }),
      );
    });
  });

  afterAll(async () => {
    if (!basePriv) return;
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      if (saleId) {
        await db.delete(ticketDiscounts).where(eq(ticketDiscounts.saleId, saleId));
        await db.delete(ticketLines).where(eq(ticketLines.saleId, saleId));
        await db.delete(ticketPayments).where(eq(ticketPayments.saleId, saleId));
        await db.delete(tickets).where(eq(tickets.saleId, saleId));
        await db.delete(cashMovements).where(eq(cashMovements.saleId, saleId));
        await db.delete(stockMovements).where(eq(stockMovements.idemKey, opId));
        await db.delete(sales).where(eq(sales.id, saleId));
      }
      await db.delete(outbox).where(eq(outbox.opId, opId));
      await db.delete(idMappings).where(eq(idMappings.opId, opId));
      await db.delete(products).where(eq(products.sku, sku));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  it("tras promote, GET por T-* y por provisorio responden 200 y el replay no cambia el número", async () => {
    fijarMulti();
    const push = (await conTenant("tenant-a", () =>
      POSTPush(
        ctx("http://localhost/api/sync/push", {
          body: {
            op_id: opId,
            device_code: device,
            device_seq: 1,
            hlc: `${Date.now()}:1`,
            modulo: "sales",
            payload: payload(),
            client_occurred_at: new Date().toISOString(),
          },
          headers: { "Idempotency-Key": opId },
        }),
      ),
    )) as Response;
    expect(push.status).toBe(201);
    saleId = String(((await push.json()) as Record<string, unknown>)["sale_id"]);

    const antes = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const filas = await db.select().from(tickets).where(eq(tickets.saleId, saleId));
      return filas[0];
    });
    expect(antes?.definitivo).toBeNull();
    const provisorio = antes?.provisorio;

    const pm = (await conTenant("tenant-a", () =>
      POSTPromote(
        ctx("http://localhost/api/sync/promote", {
          body: { op_id: opId, device_code: device, device_seq: 1 },
          headers: { "Idempotency-Key": opId },
        }),
      ),
    )) as Response;
    expect(pm.status).toBe(201);
    const definitivo = String(((await pm.json()) as Record<string, unknown>)["ticket_definitivo"]);
    expect(definitivo).toMatch(/^T-\d{6}$/);

    const porDef = (await conTenant("tenant-a", () =>
      GETTickets(ctx(`http://localhost/api/tickets?numero=${definitivo}`)),
    )) as Response;
    expect(porDef.status).toBe(200);
    const cuerpo = (await porDef.json()) as Record<string, unknown>;
    expect(cuerpo["ticket_definitivo"]).toBe(definitivo);
    expect(cuerpo["ticket_provisorio"]).toBe(provisorio);
    expect(cuerpo["fuente"]).toBe("db");
    expect(cuerpo["total_centavos"]).toBe("15000");

    const porProv = (await conTenant("tenant-a", () =>
      GETTickets(ctx(`http://localhost/api/tickets?numero=${provisorio}`)),
    )) as Response;
    expect(porProv.status).toBe(200);

    const pm2 = (await conTenant("tenant-a", () =>
      POSTPromote(
        ctx("http://localhost/api/sync/promote", {
          body: { op_id: opId, device_code: device, device_seq: 1 },
          headers: { "Idempotency-Key": opId },
        }),
      ),
    )) as Response;
    expect(pm2.status).toBe(200);
    expect(String(((await pm2.json()) as Record<string, unknown>)["ticket_definitivo"])).toBe(definitivo);

    const columna = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const filas = await db.select().from(tickets).where(eq(tickets.saleId, saleId));
      const lineas = await db.select().from(ticketLines).where(eq(ticketLines.saleId, saleId));
      return { filas, lineas };
    });
    expect(columna.filas).toHaveLength(1);
    expect(columna.filas[0]?.definitivo).toBe(definitivo);
    expect(columna.filas[0]?.provisorio).toBe(provisorio);
    expect(columna.lineas).toHaveLength(1);
  });
});
