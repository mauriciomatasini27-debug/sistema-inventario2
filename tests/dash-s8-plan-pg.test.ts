import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { tenants } from "../src/db/schema.js";
import { aiUsage, subscriptions, usageCounters } from "../src/db/schema-planes.js";
import { crearProveedorCobro, leerCatalogo, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { crearRegistroUsoIA, olvidarUsoIAMemoria } from "../src/lib/repos/ia-uso.js";
import { fechaAR } from "../src/lib/fecha-ar.js";
import { vistaPlan } from "../src/lib/plan-panel.js";

// DASH-S8: la vista de /panel/plan sobre Postgres real. Prueba el camino que la
// ruta usa (suscripción + catálogo + uso) y que A y B no se ven entre sí.
const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const tenantA = randomUUID();
const tenantB = randomUUID();
const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const MES = "2026-10";
const HOY = fechaAR(Date.parse("2026-10-17T12:00:00Z"));

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function asegurarTenantDb(nombre: "tenant-a" | "tenant-b", id: string) {
  await conTenant(nombre, async () => {
    await getTenantDb()
      .insert(tenants)
      .values({ id, nombreComercio: `Plan panel ${sufijo}`, slug: `plan-panel-${sufijo}-${nombre}` })
      .onConflictDoNothing();
  });
}

async function borrarRastroPG() {
  for (const [nombre, id] of [["tenant-a", tenantA], ["tenant-b", tenantB]] as const) {
    await conTenant(nombre, async () => {
      const db = getTenantDb();
      await db.delete(aiUsage).where(eq(aiUsage.tenantId, id));
      await db.delete(usageCounters).where(eq(usageCounters.tenantId, id));
      await db.delete(subscriptions).where(eq(subscriptions.tenantId, id));
      await db.delete(tenants).where(eq(tenants.id, id));
    });
  }
}

describe.skipIf(!hayPG)("DASH-S8 /panel/plan en Postgres: cupo del asistente A/B", () => {
  beforeAll(async () => {
    fijarMulti();
    olvidarPlanesEnMemoria();
    olvidarUsoIAMemoria();
    await asegurarTenantDb("tenant-a", tenantA);
    await asegurarTenantDb("tenant-b", tenantB);
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("A en Plus con uso tiene restante; B en Básico no incluye el asistente", async () => {
    fijarMulti();
    const a = await conTenant("tenant-a", async () => {
      await crearProveedorCobro().crearSuscripcion({ tenantId: tenantA, planId: "plus" });
      const registro = crearRegistroUsoIA();
      for (let i = 0; i < 37; i++) {
        await registro.registrar({ tenantId: tenantA, mes: MES, tokensEntrada: 1, tokensSalida: 1, costoCentavos: 0 });
      }
      const uso = await registro.usoDelMes(tenantA, MES);
      const catalogo = await leerCatalogo();
      return vistaPlan({ planId: "plus", catalogo, consultasAsistenteMes: uso.consultas, hoy: HOY });
    });
    expect(a.asistente).toMatchObject({ incluido: true, usado: 37, cupo: 100, restante: 63, agotado: false });

    const b = await conTenant("tenant-b", async () => {
      await crearProveedorCobro().crearSuscripcion({ tenantId: tenantB, planId: "basico" });
      const uso = await crearRegistroUsoIA().usoDelMes(tenantB, MES);
      const catalogo = await leerCatalogo();
      return vistaPlan({ planId: "basico", catalogo, consultasAsistenteMes: uso.consultas, hoy: HOY });
    });
    expect(b.asistente.incluido).toBe(false);
    expect(b.asistente.usado).toBe(0);
  });
});
