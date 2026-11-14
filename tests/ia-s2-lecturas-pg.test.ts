import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, sales, stockLots, stockMovements, ticketLines } from "../src/db/schema.js";
import { saleReturns, ticketDiscounts } from "../src/db/schema-tickets.js";
import { crearLecturasIA } from "../src/lib/repos/ia-lecturas.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijo = Date.now().toString(36);
const skuA = `IA2A-${sufijo}`.toUpperCase();
const skuR = `IA2R-${sufijo}`.toUpperCase();
const skuB = `IA2B-${sufijo}`.toUpperCase();
const idA = randomUUID();
const idR = randomUUID();
const idB = randomUUID();
const saleA = randomUUID();
const saleB = randomUUID();
const keyA = `ia2-a-${sufijo}`;
const keyB = `ia2-b-${sufijo}`;
const momento = new Date("2099-05-15T12:00:00.000Z");

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function borrarRastro() {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      await db.delete(saleReturns).where(inArray(saleReturns.idempotencyKey, [`${keyA}-dev`]));
      await db.delete(ticketDiscounts).where(inArray(ticketDiscounts.saleId, [saleA, saleB]));
      await db.delete(ticketLines).where(inArray(ticketLines.saleId, [saleA, saleB]));
      await db.delete(stockMovements).where(inArray(stockMovements.idemKey, [keyA, keyB, `${keyA}-dev`]));
      await db.delete(sales).where(inArray(sales.id, [saleA, saleB]));
      await db.delete(stockLots).where(inArray(stockLots.sku, [skuA, skuR, skuB]));
      await db.delete(products).where(inArray(products.sku, [skuA, skuR, skuB]));
    });
  }
}

describe.skipIf(!hayPG)("IA-S2 lecturas reales contra Postgres por tenant", () => {
  beforeAll(async () => {
    fijarMulti();
    await borrarRastro();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(products).values([
        filaPg({ id: idA, sku: skuA, nombre: "Yerba A", precioCentavos: 10000n, stockActual: 12 }),
        filaPg({ id: idR, sku: skuR, nombre: "Lento A", precioCentavos: 500n, stockActual: 4 }),
      ]);
      await db.insert(stockLots).values(filaPg({ sku: skuA, cantidad: 12, cantidadRestante: 12, costoCentavos: 6000n }));
      await db.insert(sales).values(
        filaPg({
          id: saleA,
          idempotencyKey: keyA,
          medio: "Efectivo",
          totalCentavos: 40000n,
          clientOccurredAt: momento,
          createdAt: momento,
        }),
      );
      await db.insert(ticketLines).values(filaPg({ saleId: saleA, productId: idA, qty: 4, precioCentavos: 10000n }));
      await db.insert(ticketDiscounts).values({
        saleId: saleA,
        lineaIdx: 0,
        sku: skuA,
        brutoCentavos: 40000n,
        netoCentavos: 40000n,
      });
      await db.insert(saleReturns).values({
        idempotencyKey: `${keyA}-dev`,
        saleId: saleA,
        numeroDevolucion: `D-IA2-${sufijo}`,
        montoCentavos: 10000n,
        acumuladoNuevoCentavos: 10000n,
        medio: "Efectivo",
        motivo: "prueba ia2",
        actor: "test",
      });
      await db.insert(stockMovements).values([
        filaPg({ idemKey: keyA, sku: skuA, delta: -4, tipo: "VENTA", createdAt: momento }),
        filaPg({ idemKey: `${keyA}-dev`, sku: skuA, delta: 1, tipo: "COMPENSATORIO", createdAt: momento }),
      ]);
    });
    await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      await db.insert(products).values(
        filaPg({
          id: idB,
          sku: skuB,
          nombre: "Yerba B",
          precioCentavos: 20000n,
          stockActual: 9,
        }),
      );
      await db.insert(sales).values(
        filaPg({
          id: saleB,
          idempotencyKey: keyB,
          medio: "Efectivo",
          totalCentavos: 90000n,
          clientOccurredAt: momento,
          createdAt: momento,
        }),
      );
      await db.insert(ticketLines).values(filaPg({ saleId: saleB, productId: idB, qty: 9, precioCentavos: 10000n }));
      await db.insert(ticketDiscounts).values({
        saleId: saleB,
        lineaIdx: 0,
        sku: skuB,
        brutoCentavos: 90000n,
        netoCentavos: 90000n,
      });
      await db.insert(stockMovements).values(filaPg({ idemKey: keyB, sku: skuB, delta: -9, tipo: "VENTA", createdAt: momento }));
    });
  });

  afterAll(async () => {
    if (hayPG) await borrarRastro();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("top_productos lee ventas reales, netea devoluciones y aísla el otro tenant", async () => {
    const lecturas = crearLecturasIA({ ahora: () => momento });
    const r = await lecturas.top_productos!({ tenantId: "tenant-a" }, {});

    expect(r).toEqual({
      productos: [{ sku: skuA, nombre: "Yerba A", cantidad: 3, totalCentavos: "40000" }],
      fuente: "db",
    });
  });

  it("margen_producto toma precio del catálogo y costo de los lotes", async () => {
    const lecturas = crearLecturasIA({ ahora: () => momento });
    const r = await lecturas.margen_producto!({ tenantId: "tenant-a" }, { producto: skuA });

    expect(r).toEqual({
      producto: {
        sku: skuA,
        nombre: "Yerba A",
        precioCentavos: "10000",
        costoCentavos: "6000",
        margenCentavos: "4000",
        margenPorcentaje: 40,
      },
      fuente: "db",
    });
  });

  it("rotacion_lenta no mezcla productos del tenant B", async () => {
    const lecturas = crearLecturasIA({ ahora: () => momento });
    const r = (await lecturas.rotacion_lenta!({ tenantId: "tenant-a" }, {})) as {
      productos: Array<{ sku: string }>;
      fuente: string;
    };

    expect(r.fuente).toBe("db");
    expect(r.productos.some((p) => p.sku === skuB)).toBe(false);
  });
});
