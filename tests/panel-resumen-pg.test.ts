import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { sales } from "../src/db/schema.js";
import { GET as GETResumen } from "../src/pages/api/sales/resumen.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const marca = `MedioPrueba${Date.now().toString(36)}`;
const claveA = `panel-resumen-a-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

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
        await db.delete(sales).where(eq(sales.idempotencyKey, claveA));
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
      await db.insert(sales).values({
        idempotencyKey: claveA,
        medio: marca,
        totalCentavos: 424_242n,
        clientOccurredAt: new Date(),
      });
    });

    const a = await resumenDe("tenant-a");
    expect(a.fuente).toBe("db");
    const enA = (a.por_medio as MedioJSON[]).find((m) => m.medio === marca);
    expect(enA?.centavos).toBe("424242");

    const b = await resumenDe("tenant-b");
    expect((b.por_medio as MedioJSON[]).some((m) => m.medio === marca)).toBe(false);
  });
});
