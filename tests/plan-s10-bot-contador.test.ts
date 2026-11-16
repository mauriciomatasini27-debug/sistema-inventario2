import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getTenantDb } from "../src/lib/db.js";
import { tenants } from "../src/db/schema.js";
import { usageCounters } from "../src/db/schema-planes.js";
import { whatsappUsage } from "../src/db/schema-whatsapp.js";
import { olvidarPlanesEnMemoria, leerUso } from "../src/lib/repos/planes.js";
import { registrarConsultaBot } from "../src/lib/repos/bot-consultas.js";
import { resetStore } from "../src/lib/store.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const tenantA = randomUUID();
const AHORA = Date.parse("2026-10-17T12:00:00Z");
const sufijo = `${Date.now().toString(36)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env[`TENANT_DATABASE_URL_${tenantA}`] = process.env.PG_TEST_URL_A ?? "";
}

describe("PLAN-S10 contador bot_consulta en memoria", () => {
  beforeAll(() => {
    resetStore();
    olvidarPlanesEnMemoria();
  });

  it("cada consulta nueva suma usage_counters y el wamid repetido no duplica", async () => {
    await registrarConsultaBot({
      tenantId: "t-mem",
      numeroE164: "+54911",
      wamid: `w1-${sufijo}`,
      ahoraMs: AHORA,
    });
    await registrarConsultaBot({
      tenantId: "t-mem",
      numeroE164: "+54911",
      wamid: `w1-${sufijo}`,
      ahoraMs: AHORA + 1000,
    });
    await registrarConsultaBot({
      tenantId: "t-mem",
      numeroE164: "+54911",
      wamid: `w2-${sufijo}`,
      ahoraMs: AHORA,
    });
    expect(await leerUso({ tenantId: "t-mem", mes: "2026-10", feature: "bot_consulta" })).toEqual({
      usado: 2,
      costoCentavos: 0n,
    });
  });
});

describe.skipIf(!hayPG)("PLAN-S10 contador bot_consulta en Postgres", () => {
  beforeAll(async () => {
    resetStore();
    fijarMulti();
    olvidarPlanesEnMemoria();
    // usage_counters referencia tenants(id): el uuid del test necesita su fila.
    await getTenantDb(tenantA).insert(tenants).values({
      id: tenantA,
      nombreComercio: "Plan S10",
      slug: `plan-s10-${sufijo}`,
    });
  });

  afterAll(async () => {
    if (hayPG) {
      const db = getTenantDb(tenantA);
      await db.delete(whatsappUsage).where(eq(whatsappUsage.tenantId, tenantA));
      await db.delete(usageCounters).where(eq(usageCounters.tenantId, tenantA));
      await db.delete(tenants).where(eq(tenants.id, tenantA));
    }
    delete process.env.TENANT_MODE;
    delete process.env[`TENANT_DATABASE_URL_${tenantA}`];
  });

  it("whatsapp_usage y usage_counters suben juntos; wamid duplicado no suma dos veces", async () => {
    fijarMulti();
    const base = {
      tenantId: tenantA,
      numeroE164: "+5491100000001",
      ahoraMs: AHORA,
    };
    await registrarConsultaBot({ ...base, wamid: `pg-a-${sufijo}` });
    await registrarConsultaBot({ ...base, wamid: `pg-a-${sufijo}` });
    await registrarConsultaBot({ ...base, wamid: `pg-b-${sufijo}` });

    const db = getTenantDb(tenantA);
    const [wa] = await db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(whatsappUsage)
      .where(and(eq(whatsappUsage.tenantId, tenantA), eq(whatsappUsage.tipo, "consulta")));
    expect(wa?.total).toBe(2);

    const contadores = await db
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.tenantId, tenantA), eq(usageCounters.feature, "bot_consulta")));
    expect(contadores).toHaveLength(1);
    expect(contadores[0]).toMatchObject({ mes: "2026-10", usado: 2, costoCentavos: 0n });
  });
});
