import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { activarTenantPgEnSingle, filaPg } from "./helpers/pg-tenant-fixture.js";
import { resetStore, store } from "../src/lib/store.js";
import { POST as postSales } from "../src/pages/api/sales.js";

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

describe("CAJA-S4 memoria: pago dividido crea 1 ticket + N egresos origen=venta vinculados", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("10000 Efectivo + 5000 QR sobre 15000 => 201, 2 egresos vinculados por cash_movement_id", async () => {
    const key = `caja-s4-split-${Date.now()}`;
    const r = (await postSales(
      ctx("http://x/api/sales", {
        body: ventaBody({ pagos: [{ medio: "Efectivo", monto_centavos: 10000 }, { medio: "QR", monto_centavos: 5000 }] }),
        headers: { "Idempotency-Key": key },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as {
      sale_id: string;
      ticket_definitivo: string | null;
      ticket_provisorio: string;
      total_centavos: string;
      pagos: Array<{ medio: string; monto_centavos: string; cash_movement_id: string }>;
    };
    expect(j.total_centavos).toBe("15000");
    expect(j.pagos.length).toBe(2);
    expect(j.ticket_definitivo ?? j.ticket_provisorio).toBeTruthy();
    const ids = j.pagos.map((p) => p.cash_movement_id);
    expect(new Set(ids).size).toBe(2);

    const movs = store.movements.filter((m) => m.sale_id === j.sale_id);
    expect(movs.length).toBe(2);
    for (const m of movs) {
      expect(m.tipo).toBe("ingreso");
      expect(m.origen).toBe("venta");
    }
    expect(movs.map((m) => m.monto_centavos).sort()).toEqual(["10000", "5000"]);
    expect(movs.map((m) => m.id).sort()).toEqual([...ids].sort());

    const espejo = store.ticketPagos.get(j.sale_id) ?? [];
    expect(espejo.map((p) => p.cashMovementId).sort()).toEqual([...ids].sort());
  });

  it("suma distinta del total => 422 sin escribir movimientos", async () => {
    const antes = store.movements.length;
    const r = (await postSales(
      ctx("http://x/api/sales", {
        body: ventaBody({ pagos: [{ medio: "Efectivo", monto_centavos: 9000 }, { medio: "QR", monto_centavos: 5000 }] }),
        headers: { "Idempotency-Key": `caja-s4-mismatch-${Date.now()}` },
      }),
    )) as Response;
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toBe("pagos no suman total");
    expect(store.movements.length).toBe(antes);
  });

  it("sin pagos => 1 egreso con el medio de la venta", async () => {
    const r = (await postSales(
      ctx("http://x/api/sales", {
        body: ventaBody(),
        headers: { "Idempotency-Key": `caja-s4-simple-${Date.now()}` },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as {
      sale_id: string;
      pagos: Array<{ medio: string; monto_centavos: string; cash_movement_id: string }>;
    };
    expect(j.pagos.length).toBe(1);
    const movs = store.movements.filter((m) => m.sale_id === j.sale_id);
    expect(movs.length).toBe(1);
    expect(movs[0]?.tipo).toBe("ingreso");
    expect(movs[0]?.origen).toBe("venta");
    expect(movs[0]?.id).toBe(j.pagos[0]?.cash_movement_id);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const skuPG = `caja-s4-${sufijoPG}`;
const devicePG = `pg-s4-${sufijoPG}`;

describe.skipIf(!hayPG)("CAJA-S4 PG: ticket_payments.cash_movement_id referencia cash_movements.id", () => {
  it("venta dividida persiste N egresos y cada ticket_payment apunta a su movimiento", async () => {
    const { sql } = await import("drizzle-orm");
    const { eq } = await import("drizzle-orm");
    const { getTenantDb } = await import("../src/lib/db.js");
    const { sales, tickets, cashMovements, ticketPayments } = await import("../src/db/schema.js");
    modoSingleSinDb();
    resetStore();
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
    activarTenantPgEnSingle();
    let saleId = "";
    try {
      const db = getTenantDb();
      const { products } = await import("../src/db/schema.js");
      await db
        .insert(products)
        .values(filaPg({ sku: skuPG, nombre: "Caja S4", precioCentavos: 15000n, stockActual: 10 }))
        .onConflictDoNothing({ target: [products.tenantId, products.sku] });
      const key = `caja-s4-pg-${sufijoPG}`;
      const r = (await postSales(
        ctx("http://x/api/sales", {
          body: ventaBody({
            lineas: [{ product_id: skuPG, qty: 1, precio_centavos: 15000 }],
            device_code: devicePG,
            pagos: [{ medio: "Efectivo", monto_centavos: 10000 }, { medio: "QR", monto_centavos: 5000 }],
          }),
          headers: { "Idempotency-Key": key },
        }),
      )) as Response;
      expect(r.status).toBe(201);
      saleId = ((await r.json()) as { sale_id: string }).sale_id;

      const pagos = await db.select().from(ticketPayments).where(eq(ticketPayments.saleId, saleId));
      expect(pagos.length).toBe(2);
      expect(pagos.map((p) => p.montoCentavos.toString()).sort()).toEqual(["10000", "5000"]);
      for (const p of pagos) {
        expect(typeof p.cashMovementId).toBe("string");
        const mov = await db.select().from(cashMovements).where(eq(cashMovements.id, p.cashMovementId as string)).limit(1);
        expect(mov.length).toBe(1);
        expect(mov[0]?.saleId).toBe(saleId);
        expect(mov[0]?.tipo).toBe("ingreso");
        expect(mov[0]?.origen).toBe("venta");
        expect(mov[0]?.montoCentavos).toBe(p.montoCentavos);
      }
    } finally {
      const db = getTenantDb();
      if (saleId) {
        await db.delete(ticketPayments).where(eq(ticketPayments.saleId, saleId));
        await db.delete(cashMovements).where(eq(cashMovements.saleId, saleId));
        await db.delete(tickets).where(eq(tickets.saleId, saleId));
        await db.delete(sales).where(eq(sales.id, saleId));
      }
      await db.execute(sql`delete from stock_lots where sku = ${skuPG}`);
      await db.execute(sql`delete from products where sku = ${skuPG}`);
      delete process.env.TENANT_DATABASE_URL;
    }
  });
});
