import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { sales } from "../src/db/schema.js";
import { saleReturns, ticketPaymentCorrections } from "../src/db/schema-tickets.js";
import { GET as GETResumen } from "../src/pages/api/sales/resumen.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const marca = `MedioPrueba${Date.now().toString(36)}`;
const marcaNeto = `MedioNeto${Date.now().toString(36)}`;
const marcaCorregida = `MedioCorregido${Date.now().toString(36)}`;
const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const claveA = `panel-resumen-a-${sufijo}`;
const claveNeto = `panel-resumen-neto-${sufijo}`;
const claveCorregida = `panel-resumen-corrventa-${sufijo}`;
const claveRetorno = `panel-resumen-ret-${sufijo}`;
const claveCorreccion = `panel-resumen-corr-${sufijo}`;
const numeroDevolucion = `D-TEST-${sufijo}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function resumenDe(tenant: string): Promise<Record<string, unknown>> {
  const res = (await conTenant(tenant, () => GETResumen(ctx("http://test/api/sales/resumen")))) as Response;
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

type MedioJSON = { medio: string; centavos: string };

describe.skipIf(!hayPG)("P3-7c resumen del panel: aislamiento por tenant en Postgres", () => {
  beforeAll(() => {
    fijarMulti();
  });

  afterAll(async () => {
    if (hayPG) {
      await conTenant("tenant-a", async () => {
        const db = getTenantDb();
        await db.delete(ticketPaymentCorrections).where(eq(ticketPaymentCorrections.idempotencyKey, claveCorreccion));
        await db.delete(saleReturns).where(eq(saleReturns.idempotencyKey, claveRetorno));
        await db.delete(sales).where(eq(sales.idempotencyKey, claveA));
        await db.delete(sales).where(eq(sales.idempotencyKey, claveNeto));
        await db.delete(sales).where(eq(sales.idempotencyKey, claveCorregida));
      });
    }
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("la venta de A aparece en el resumen de A y el de B nunca la ve", async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(sales).values(
        filaPg({
          idempotencyKey: claveA,
          medio: marca,
          totalCentavos: 424_242n,
          clientOccurredAt: new Date(),
        }),
      );
    });

    const a = await resumenDe("tenant-a");
    expect(a.fuente).toBe("db");
    const enA = (a.por_medio as MedioJSON[]).find((m) => m.medio === marca);
    expect(enA?.centavos).toBe("424242");

    const b = await resumenDe("tenant-b");
    expect((b.por_medio as MedioJSON[]).some((m) => m.medio === marca)).toBe(false);
  });

  it("la devolución netea A y la corrección mueve el bucket de A; B nunca las ve", async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const [v1] = await db
        .insert(sales)
        .values(filaPg({ idempotencyKey: claveNeto, medio: marcaNeto, totalCentavos: 100_000n, clientOccurredAt: new Date() }))
        .returning({ id: sales.id });
      const [v2] = await db
        .insert(sales)
        .values(filaPg({ idempotencyKey: claveCorregida, medio: "Efectivo", totalCentavos: 50_000n, clientOccurredAt: new Date() }))
        .returning({ id: sales.id });
      await db.insert(saleReturns).values({
        idempotencyKey: claveRetorno,
        saleId: v1!.id,
        numeroDevolucion,
        montoCentavos: 20_000n,
        acumuladoNuevoCentavos: 20_000n,
        medio: marcaNeto,
        motivo: "prueba pg",
        actor: "test",
      });
      await db.insert(ticketPaymentCorrections).values({
        idempotencyKey: claveCorreccion,
        saleId: v2!.id,
        medioOriginal: "Efectivo",
        medioNuevo: marcaCorregida,
        motivo: "prueba pg",
        actor: "test",
      });
    });

    const a = await resumenDe("tenant-a");
    const enA = a.por_medio as MedioJSON[];
    expect(enA.find((m) => m.medio === marcaNeto)?.centavos).toBe("80000");
    expect(enA.find((m) => m.medio === marcaCorregida)?.centavos).toBe("50000");

    const b = await resumenDe("tenant-b");
    const enB = b.por_medio as MedioJSON[];
    expect(enB.some((m) => m.medio === marcaNeto)).toBe(false);
    expect(enB.some((m) => m.medio === marcaCorregida)).toBe(false);
  });
});
