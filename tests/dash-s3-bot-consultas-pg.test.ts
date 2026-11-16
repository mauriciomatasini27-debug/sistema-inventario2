import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getTenantDb } from "../src/lib/db.js";
import { tenants } from "../src/db/schema.js";
import { usageCounters } from "../src/db/schema-planes.js";
import { whatsappUsage } from "../src/db/schema-whatsapp.js";
import { resetStore } from "../src/lib/store.js";
import { contarConsultasBotDelMes, leerResumenConsultasBot, registrarConsultaBot } from "../src/lib/repos/bot-consultas.js";

// DASH-S3: el resumen de la tarjeta `Bot` contra Postgres real (whatsapp_usage,
// tenant_id uuid): count del día AR + max, dedupe por wamid y aislamiento.
const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const tenantA = randomUUID();
const tenantB = randomUUID();
const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const AHORA = Date.parse("2026-10-17T12:00:00Z");
const AYER_AR = Date.parse("2026-10-17T02:30:00Z"); // 23:30 AR del 16

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env[`TENANT_DATABASE_URL_${tenantA}`] = process.env.PG_TEST_URL_A ?? "";
  process.env[`TENANT_DATABASE_URL_${tenantB}`] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("DASH-S3 consultas del bot en Postgres", () => {
  beforeAll(async () => {
    resetStore();
    fijarMulti();
    // usage_counters referencia tenants(id): los uuid del test necesitan su fila.
    await getTenantDb(tenantA).insert(tenants).values({
      id: tenantA,
      nombreComercio: "Dash S3 A",
      slug: `dash-s3-a-${sufijo}`,
    });
    await getTenantDb(tenantB).insert(tenants).values({
      id: tenantB,
      nombreComercio: "Dash S3 B",
      slug: `dash-s3-b-${sufijo}`,
    });
  });

  afterAll(async () => {
    if (hayPG) {
      await getTenantDb(tenantA).delete(whatsappUsage).where(eq(whatsappUsage.tenantId, tenantA));
      await getTenantDb(tenantB).delete(whatsappUsage).where(eq(whatsappUsage.tenantId, tenantB));
      await getTenantDb(tenantA).delete(usageCounters).where(eq(usageCounters.tenantId, tenantA));
      await getTenantDb(tenantB).delete(usageCounters).where(eq(usageCounters.tenantId, tenantB));
      await getTenantDb(tenantA).delete(tenants).where(eq(tenants.id, tenantA));
      await getTenantDb(tenantB).delete(tenants).where(eq(tenants.id, tenantB));
    }
    delete process.env.TENANT_MODE;
    delete process.env[`TENANT_DATABASE_URL_${tenantA}`];
    delete process.env[`TENANT_DATABASE_URL_${tenantB}`];
  });

  it("cuenta solo las de hoy AR, marca la última, no duplica por wamid y B no ve las de A", async () => {
    fijarMulti();
    await registrarConsultaBot({ tenantId: tenantA, numeroE164: "+5491100000001", wamid: `wa-ayer-${sufijo}`, ahoraMs: AYER_AR });
    await registrarConsultaBot({ tenantId: tenantA, numeroE164: "+5491100000001", wamid: `wa-hoy-${sufijo}`, ahoraMs: AHORA - 60_000 });
    await registrarConsultaBot({ tenantId: tenantA, numeroE164: "+5491100000001", wamid: `wa-hoy-${sufijo}`, ahoraMs: AHORA });
    expect(await leerResumenConsultasBot(tenantA, AHORA)).toEqual({ hoy: 1, ultimaEnMs: AHORA - 60_000 });
    expect(await leerResumenConsultasBot(tenantB, AHORA)).toEqual({ hoy: 0, ultimaEnMs: null });
  });

  it("PLAN-S7: cuenta las consultas del mes AR, sin las del mes anterior ni duplicados, y B no ve las de A", async () => {
    fijarMulti();
    const SEPT_AR = Date.parse("2026-10-01T02:30:00Z"); // 23:30 AR del 30/9
    await registrarConsultaBot({ tenantId: tenantA, numeroE164: "+5491100000001", wamid: `wa-sept-${sufijo}`, ahoraMs: SEPT_AR });
    await registrarConsultaBot({ tenantId: tenantA, numeroE164: "+5491100000001", wamid: `wa-hoy-${sufijo}`, ahoraMs: AHORA });
    // ayer (16/10) y hoy (17/10) ya están del caso anterior; el duplicado no suma.
    expect(await contarConsultasBotDelMes(tenantA, AHORA)).toBe(2);
    expect(await contarConsultasBotDelMes(tenantB, AHORA)).toBe(0);
  });
});
