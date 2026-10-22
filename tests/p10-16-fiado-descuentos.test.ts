import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { cashMovements, sales, ticketLines } from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { customerMovements } from "../src/db/schema-credito.js";
import { POST as POSTSale } from "../src/pages/api/credit/sales-on-account.js";
import { POST as POSTProducto } from "../src/pages/api/products.js";
import { POST as POSTIngreso } from "../src/pages/api/stock/ingreso.js";
import { GET as getDescription } from "../src/pages/api/tickets.js";
import { GET as GETBalance } from "../src/pages/api/credit/balance.js";
import { cobroFiado } from "../src/lib/repos/fiado.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

function req(key: string, body: unknown) {
  return ctx("http://x/api/credit/sales-on-account", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: body as Record<string, unknown>,
  });
}

function cuerpoCliente(cliente: string, sku = "demo-sku-1") {
  return {
    customer_id: cliente,
    lineas: [
      { product_id: sku, qty: 2, precio_centavos: 10000 },
      { product_id: sku, qty: 1, precio_centavos: 10000 },
    ],
    device_code: "caja-01",
    seq_local: 1,
    tope_centavos: 100000,
    saldo_actual_centavos: 0,
  };
}

describe("P10-16 memoria: venta a cuenta deja snapshot de descuentos consultable", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.TENANT_DATABASE_URL;
  });

  it("201 en memoria y GET /api/tickets muestra bruto, descuentos en cero y neto", async () => {
    const r = (await POSTSale(req(`p10-16-mem-${Date.now()}`, cuerpoCliente("cli-16")))) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { ticket_definitivo: string; total_centavos: string };
    expect(j.total_centavos).toBe("30000");

    const t = (await getDescription(ctx(`http://x/api/tickets?numero=${j.ticket_definitivo}`))) as Response;
    expect(t.status).toBe(200);
    const tj = (await t.json()) as {
      total_centavos: string;
      lineas: Array<{
        bruto_centavos: string;
        desc_linea_centavos: string;
        desc_ticket_centavos: string;
        neto_centavos: string;
      }>;
    };
    expect(tj.total_centavos).toBe("30000");
    expect(tj.lineas).toHaveLength(2);
    for (const l of tj.lineas) {
      expect(l.bruto_centavos).toBe(l.neto_centavos);
      expect(l.desc_linea_centavos).toBe("0");
      expect(l.desc_ticket_centavos).toBe("0");
    }

    const b = (await GETBalance(ctx("http://x/api/credit/balance?customer_id=cli-16"))) as Response;
    expect(((await b.json()) as Record<string, unknown>)["saldo_centavos"]).toBe("30000");
  });
});

const URL_A = process.env.PG_TEST_URL_A;
const URL_B = process.env.PG_TEST_URL_B;
const claveVenta = `p10-16-${Date.now().toString(36)}-vta`;
const claveCobro = `p10-16-${Date.now().toString(36)}-cob`;
const cliente = `p10-16-${Date.now().toString(36)}-cli`;

function fijarMulti(urlA: string, urlB: string) {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = urlA;
  process.env["TENANT_DATABASE_URL_tenant-b"] = urlB;
}

afterAll(() => {
  delete process.env.TENANT_MODE;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
});

describe.skipIf(!(URL_A && URL_B))("P10-16 PG vivo: venta a cuenta y cobro aislados por tenant", () => {
  let dbA: ReturnType<typeof getTenantDb>;
  let dbB: ReturnType<typeof getTenantDb>;

  beforeAll(async () => {
    const urlA = await asegurarBasePrivada("p10_16_fiado_desc_a", URL_A ?? "");
    const urlB = await asegurarBasePrivada("p10_16_fiado_desc_b", URL_B ?? URL_A ?? "");
    fijarMulti(urlA, urlB);
    resetStore();
    dbA = getTenantDb("tenant-a");
    dbB = getTenantDb("tenant-b");
    const altaProd = (await conTenant("tenant-a", () =>
      POSTProducto(
        ctx("http://x/api/products", {
          body: { sku: "DEMO-SKU-1", nombre: "Yerba", precio_centavos: 10000 },
        }),
      ),
    )) as Response;
    expect([200, 201, 409]).toContain(altaProd.status);
    const ingreso = (await conTenant("tenant-a", () =>
      POSTIngreso(ctx("http://x/api/stock/ingreso", { body: { sku: "DEMO-SKU-1", cantidad: 5, costo_centavos: 4000 } })),
    )) as Response;
    expect([200, 201, 409]).toContain(ingreso.status);
  });

  it("venta en A persiste ticket lines + snapshot en una tx, B no los ve", async () => {
    const r = (await conTenant("tenant-a", () => POSTSale(req(claveVenta, cuerpoCliente(cliente, "DEMO-SKU-1"))))) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { total_centavos: string; fuente: string };
    expect(j.fuente).toBe("db");
    expect(j.total_centavos).toBe("30000");

    const movs = await dbA.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, claveVenta));
    expect(movs).toHaveLength(1);
    const saleId = movs[0]!.saleId!;

    const lineas = await dbA.select().from(ticketLines).where(eq(ticketLines.saleId, saleId));
    expect(lineas).toHaveLength(2);

    const snaps = await dbA
      .select()
      .from(ticketDiscounts)
      .where(eq(ticketDiscounts.saleId, saleId))
      .orderBy(ticketDiscounts.lineaIdx);
    expect(snaps.map((s) => `${s.lineaIdx}:${s.brutoCentavos}:${s.netoCentavos}`)).toEqual(["0:20000:20000", "1:10000:10000"]);
    for (const s of snaps) {
      expect(s.descLineaCentavos).toBe(0n);
      expect(s.descTicketCentavos).toBe(0n);
    }

    const b = (await conTenant("tenant-a", () => GETBalance(ctx(`http://x/api/credit/balance?customer_id=${cliente}`)))) as Response;
    expect(((await b.json()) as Record<string, unknown>)["saldo_centavos"]).toBe("30000");

    expect(await dbB.select().from(ticketLines).where(eq(ticketLines.saleId, saleId))).toHaveLength(0);
    expect(await dbB.select().from(ticketDiscounts).where(eq(ticketDiscounts.saleId, saleId))).toHaveLength(0);
    expect(await dbB.select().from(sales).where(eq(sales.id, saleId))).toHaveLength(0);

    const dup = (await conTenant("tenant-a", () => POSTSale(req(claveVenta, cuerpoCliente(cliente, "DEMO-SKU-1"))))) as Response;
    expect(dup.status).toBe(409);
  });

  it("cobro en A reduce el saldo y B sigue sin verlo", async () => {
    const r = await conTenant("tenant-a", () =>
      cobroFiado({ key: claveCobro, customerId: cliente, montoCentavos: 12000n, medio: "Efectivo" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("cobro invalido en test");
    expect(r.fuente).toBe("db");

    const caja = await dbA.select().from(cashMovements).where(eq(cashMovements.idempotencyKey, claveCobro));
    expect(caja).toHaveLength(1);
    const credito = await dbA.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, claveCobro));
    expect(credito).toHaveLength(1);

    const b = (await conTenant("tenant-a", () => GETBalance(ctx(`http://x/api/credit/balance?customer_id=${cliente}`)))) as Response;
    expect(((await b.json()) as Record<string, unknown>)["saldo_centavos"]).toBe("18000");

    expect(await dbB.select().from(cashMovements).where(eq(cashMovements.idempotencyKey, claveCobro))).toHaveLength(0);
    expect(await dbB.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, claveCobro))).toHaveLength(0);
  });
});
