import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
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
  ticketCounters,
  ticketLines,
  ticketPayments,
  tickets,
} from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { POST as POSTPush } from "../src/pages/api/sync/push.js";
import { POST as POSTPromote } from "../src/pages/api/sync/promote.js";

const URL_A = process.env.PG_TEST_URL_A;
const PREFIJO = `p10-17-${Date.now().toString(36)}`;
const tenantId = crypto.randomUUID();
const sku = `${PREFIJO}-SKU`.slice(0, 32);
const device = `${PREFIJO}-dev`.slice(0, 32);
const opId = crypto.randomUUID();

describe.skipIf(!URL_A)("P10-17 promote con base viva no numera desde memoria", () => {
  let basePriv = "";
  let saleId = "";

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("p10_17_promote_503", URL_A ?? "");
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = basePriv;
    delete process.env.CONTROL_DATABASE_URL;
    resetStore();
    await conTenant(tenantId, async () => {
      const db = getTenantDb();
      await db.insert(products).values(
        filaPg({
          sku,
          nombre: "Producto P10-17",
          precioCentavos: 15000n,
          stockActual: 10,
        }),
      );
    });
  });

  afterAll(async () => {
    if (!basePriv) return;
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = basePriv;
    await conTenant(tenantId, async () => {
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
      await db
        .delete(ticketCounters)
        .where(and(eq(ticketCounters.id, "mostrador"), eq(ticketCounters.tenantId, tenantId)));
      await db.delete(products).where(eq(products.sku, sku));
    });
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    resetStore();
  });

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

  async function crearTriggerFalla() {
    await conTenant(tenantId, async () => {
      const db = getTenantDb();
      await db.execute(sql.raw(`
        CREATE OR REPLACE FUNCTION p10_17_falla_promote() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.op_id = '${opId}' THEN
            RAISE EXCEPTION 'P10-17 fallo forzado en id_mappings';
          END IF;
          RETURN NEW;
        END $$;
      `));
      await db.execute(sql.raw("DROP TRIGGER IF EXISTS p10_17_falla_promote ON id_mappings"));
      await db.execute(sql.raw(`
        CREATE TRIGGER p10_17_falla_promote
        BEFORE INSERT OR UPDATE ON id_mappings
        FOR EACH ROW
        WHEN (NEW.op_id = '${opId}')
        EXECUTE FUNCTION p10_17_falla_promote();
      `));
    });
  }

  async function borrarTriggerFalla() {
    await conTenant(tenantId, async () => {
      const db = getTenantDb();
      await db.execute(sql.raw("DROP TRIGGER IF EXISTS p10_17_falla_promote ON id_mappings"));
      await db.execute(sql.raw("DROP FUNCTION IF EXISTS p10_17_falla_promote()"));
    });
  }

  async function contadorMostrador() {
    return conTenant(tenantId, async () => {
      const db = getTenantDb();
      const filas = await db
        .select()
        .from(ticketCounters)
        .where(and(eq(ticketCounters.id, "mostrador"), eq(ticketCounters.tenantId, tenantId)));
      return filas[0]?.ultimo ?? 0;
    });
  }

  async function ticketDefinitivo() {
    return conTenant(tenantId, async () => {
      const db = getTenantDb();
      const filas = await db.select().from(tickets).where(eq(tickets.saleId, saleId));
      return filas[0]?.definitivo ?? null;
    });
  }

  it("si la tx de promote falla responde 503, no avanza el contador y el reintento funciona", async () => {
    const push = await conTenant(tenantId, () =>
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
    );
    expect(push.status).toBe(201);
    saleId = String(((await push.json()) as Record<string, unknown>)["sale_id"]);

    const contadorAntes = await contadorMostrador();
    expect(await ticketDefinitivo()).toBeNull();

    await crearTriggerFalla();

    const fallo = await conTenant(tenantId, () =>
      POSTPromote(
        ctx("http://localhost/api/sync/promote", {
          body: { op_id: opId, device_code: device, device_seq: 1 },
          headers: { "Idempotency-Key": opId },
        }),
      ),
    );
    expect(fallo.status).toBe(503);
    expect(((await fallo.json()) as Record<string, unknown>).error).toBe("base_no_disponible");

    expect(await contadorMostrador()).toBe(contadorAntes);
    expect(await ticketDefinitivo()).toBeNull();

    await borrarTriggerFalla();

    const ok = await conTenant(tenantId, () =>
      POSTPromote(
        ctx("http://localhost/api/sync/promote", {
          body: { op_id: opId, device_code: device, device_seq: 1 },
          headers: { "Idempotency-Key": opId },
        }),
      ),
    );
    expect(ok.status).toBe(201);
    const cuerpo = (await ok.json()) as Record<string, unknown>;
    expect(cuerpo.ticket_definitivo).toMatch(/^T-\d{6}$/);

    expect(await contadorMostrador()).toBe(contadorAntes + 1);
    expect(await ticketDefinitivo()).toBe(cuerpo.ticket_definitivo);
  });
});
