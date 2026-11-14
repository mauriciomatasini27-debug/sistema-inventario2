import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cashMovements,
  products,
  sales,
  stockMovements,
  ticketLines,
  ticketPayments,
  tickets,
} from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { getTenantDb } from "../src/lib/db.js";
import { construirResumen } from "../src/lib/panel-resumen.js";
import { leerResumenPanel } from "../src/lib/repos/panel.js";
import { buscarTicketPorNumero } from "../src/lib/repos/tickets.js";
import { buscarVentaPorId as buscarVentaRepo } from "../src/lib/repos/ventas.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { buscarVentaPorId as buscarVentaModulo } from "../src/modules/sales/buscar_venta.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
const hayPG = Boolean(process.env.PG_TEST_URL_A);

function guardarEnv(): Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> {
  const snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restaurarEnv(snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function numeroTicket(venta: { efecto: { ticket: { definitivo: string | null; provisorio: string } } }): string {
  return venta.efecto.ticket.definitivo ?? venta.efecto.ticket.provisorio;
}

async function vender(sku: string, precio: number, key: string) {
  store.stock.set(sku, 10);
  return registrar_venta({
    key,
    lineas: [{ product_id: sku, qty: 1, precio_centavos: precio }],
    medio: "Efectivo",
    deviceCode: "caja-c6",
    seqLocal: 1,
    offline: false,
    clientOccurredAt: new Date().toISOString(),
  });
}

describe("ADR-0116 C6 ventas shared en memoria", () => {
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  it("A no abre la venta ni el ticket de B", async () => {
    const a = await conTenant("tenant-a", () => vender("YERBA", 1000, "c6-mem-a"));
    const b = await conTenant("tenant-b", () => vender("YERBA", 4000, "c6-mem-b"));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const ventaB = await conTenant("tenant-b", () => buscarVentaRepo(a.venta.saleId));
    const ventaBMod = await conTenant("tenant-b", () => buscarVentaModulo(a.venta.saleId));
    const ventaA = await conTenant("tenant-a", () => buscarVentaRepo(a.venta.saleId));
    expect(ventaB).toBeNull();
    expect(ventaBMod).toBeNull();
    expect(ventaA?.total_centavos).toBe("1000");

    const numA = numeroTicket(a.venta);
    const ticketB = await conTenant("tenant-b", () => buscarTicketPorNumero(numA));
    expect(ticketB?.ticket.sale_id === a.venta.saleId).toBe(false);
    expect(ticketB === null || ticketB.ticket.total_centavos === "4000").toBe(true);
  });
});

describe.skipIf(!hayPG)("ADR-0116 C6 ventas shared en Postgres", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const claves: string[] = [];
  const skus: string[] = [];
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  afterAll(async () => {
    if (!process.env.PG_TEST_URL_A) return;
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      const ventas = claves.length > 0 ? await db.select({ id: sales.id }).from(sales).where(inArray(sales.idempotencyKey, claves)) : [];
      const saleIds = ventas.map((v) => v.id);
      if (saleIds.length > 0) {
        await db.delete(ticketPayments).where(inArray(ticketPayments.saleId, saleIds));
        await db.delete(ticketDiscounts).where(inArray(ticketDiscounts.saleId, saleIds));
        await db.delete(ticketLines).where(inArray(ticketLines.saleId, saleIds));
        await db.delete(tickets).where(inArray(tickets.saleId, saleIds));
        await db.delete(cashMovements).where(inArray(cashMovements.saleId, saleIds));
        await db.delete(stockMovements).where(inArray(stockMovements.idemKey, claves));
        await db.delete(sales).where(inArray(sales.id, saleIds));
      }
      if (skus.length > 0) await db.delete(products).where(inArray(products.sku, skus));
    });
  });

  async function sembrar(tenantId: string, sku: string) {
    skus.push(sku);
    await conTenant(tenantId, () =>
      getTenantDb().insert(products).values({
        sku,
        nombre: "C6",
        precioCentavos: 1000n,
        stockActual: 10,
        tenantId,
      }),
    );
  }

  it("el panel y el ticket de A no incluyen la venta de B ni ventas de otro tenant_id", async () => {
    const skuA = `C6A${randomUUID().slice(0, 8)}`.toUpperCase();
    const skuB = `C6B${randomUUID().slice(0, 8)}`.toUpperCase();
    const keyA = `c6-a-${randomUUID()}`;
    const keyB = `c6-b-${randomUUID()}`;
    const keyOtro = `c6-otro-${randomUUID()}`;
    const tenantC = randomUUID();
    claves.push(keyA, keyB, keyOtro);
    await sembrar(tenantA, skuA);
    await sembrar(tenantB, skuB);

    const a = await conTenant(tenantA, () => vender(skuA, 1000, keyA));
    const b = await conTenant(tenantB, () => vender(skuB, 4000, keyB));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.venta.fuente).toBe("db");
    expect(b.venta.fuente).toBe("db");

    await conTenant(tenantA, () =>
      getTenantDb().insert(sales).values(
        filaPg(
          {
            idempotencyKey: keyOtro,
            medio: "Efectivo",
            totalCentavos: 9_999_999n,
            clientOccurredAt: new Date(),
          },
          tenantC,
        ),
      ),
    );

    const crudaA = await conTenant(tenantA, () => getTenantDb().select().from(sales).where(eq(sales.idempotencyKey, keyA)));
    const ticketA = await conTenant(tenantA, () => getTenantDb().select().from(tickets).where(eq(tickets.saleId, a.venta.saleId)));
    expect(crudaA[0]?.tenantId).toBe(tenantA);
    expect(ticketA[0]?.tenantId).toBe(tenantA);

    const leidoA = await conTenant(tenantA, () => leerResumenPanel());
    const leidoB = await conTenant(tenantB, () => leerResumenPanel());
    expect(leidoA.fuente).toBe("db");
    expect(leidoB.fuente).toBe("db");
    const resumenA = construirResumen(new Date(), leidoA.datos);
    const resumenB = construirResumen(new Date(), leidoB.datos);
    expect(resumenA.ventas_mes_centavos).toBe("1000");
    expect(resumenA.tickets_hoy).toBe(1);
    expect(resumenB.ventas_mes_centavos).toBe("4000");
    expect(resumenB.tickets_hoy).toBe(1);
    expect(leidoA.datos.ventas.map((v) => v.saleId)).toEqual([a.venta.saleId]);
    expect(leidoB.datos.ventas.map((v) => v.saleId)).toEqual([b.venta.saleId]);

    const numA = numeroTicket(a.venta);
    const propio = await conTenant(tenantA, () => buscarTicketPorNumero(numA));
    const ajeno = await conTenant(tenantB, () => buscarTicketPorNumero(numA));
    expect(propio?.ticket.sale_id).toBe(a.venta.saleId);
    expect(ajeno?.ticket.sale_id ?? null).not.toBe(a.venta.saleId);

    const porId = await conTenant(tenantB, () => buscarVentaRepo(a.venta.saleId));
    const porModulo = await conTenant(tenantB, () => buscarVentaModulo(a.venta.saleId));
    expect(porId).toBeNull();
    expect(porModulo).toBeNull();
  });

  it("la misma key de A no le devuelve esa venta a B", async () => {
    const skuA = `C6K${randomUUID().slice(0, 8)}`.toUpperCase();
    const skuB = `C6L${randomUUID().slice(0, 8)}`.toUpperCase();
    const key = `c6-key-${randomUUID()}`;
    claves.push(key);
    await sembrar(tenantA, skuA);
    await sembrar(tenantB, skuB);
    const a = await conTenant(tenantA, () => vender(skuA, 1000, key));
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const cruce = await conTenant(tenantB, () => vender(skuB, 1, key));
    expect(cruce.ok).toBe(true);
    if (!cruce.ok) return;
    expect(cruce.venta.fuente).toBe("db");
    expect(cruce.venta.saleId).not.toBe(a.venta.saleId);
  });

  it("en single con PG sella tenant_id (DEFAULT uuid) y el panel ve la fila", async () => {
    process.env.TENANT_MODE = "single";
    process.env.DEFAULT_TENANT_ID = filaPg({ x: 0 }).tenantId;
    const sku = `C6S${randomUUID().slice(0, 8)}`.toUpperCase();
    const key = `c6-single-${randomUUID()}`;
    claves.push(key);
    skus.push(sku);
    const db = getTenantDb();
    await db.insert(products).values(filaPg({ sku, nombre: "C6", precioCentavos: 700n, stockActual: 10 }));
    store.stock.set(sku, 10);
    const r = await registrar_venta({
      key,
      lineas: [{ product_id: sku, qty: 1, precio_centavos: 700 }],
      medio: "Efectivo",
      deviceCode: "caja-c6",
      seqLocal: 1,
      offline: false,
      clientOccurredAt: new Date().toISOString(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cruda = await db.select().from(sales).where(eq(sales.idempotencyKey, key));
    expect(cruda).toHaveLength(1);
    expect(cruda[0]?.tenantId).toBe(process.env.DEFAULT_TENANT_ID);
    const leido = await leerResumenPanel();
    expect(leido.datos.ventas.some((v) => v.saleId === r.venta.saleId)).toBe(true);
  });
});
