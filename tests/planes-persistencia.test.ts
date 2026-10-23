import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { tenants } from "../src/db/schema.js";
import { subscriptions, usageCounters } from "../src/db/schema-planes.js";
import {
  crearProveedorCobro,
  leerCatalogo,
  leerSuscripcionActiva,
  leerUso,
  olvidarPlanesEnMemoria,
  planIncluye,
  registrarUso,
} from "../src/lib/repos/planes.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

describe("PLAN-S1/S10 memoria: catálogo, suscripción única y contadores", () => {
  beforeEach(() => {
    modoSingleSinDb();
    olvidarPlanesEnMemoria();
  });

  it("el catálogo en memoria trae Básico/Plus/Pro con cupo 100 de bot en Básico", async () => {
    const catalogo = await leerCatalogo();
    expect(catalogo.map((p) => p.id)).toEqual(["basico", "plus", "pro"]);
    expect(catalogo.find((p) => p.id === "basico")?.cupos.bot_consulta).toBe(100);
  });

  it("planIncluye refleja el plan activo: Básico niega asistente_ia, Plus lo afirma (PLAN-S1)", async () => {
    const cobro = crearProveedorCobro();
    const tenant = `mem-t-${Date.now().toString(36)}`;
    await cobro.crearSuscripcion({ tenantId: tenant, planId: "basico" });
    expect(await planIncluye(tenant, "asistente_ia")).toEqual({ incluida: false, cupo: null, planId: "basico" });
    expect(await planIncluye(tenant, "bot_consulta")).toEqual({ incluida: true, cupo: 100, planId: "basico" });
    await cobro.crearSuscripcion({ tenantId: tenant, planId: "plus" });
    expect(await planIncluye(tenant, "asistente_ia")).toEqual({ incluida: true, cupo: null, planId: "plus" });
  });

  it("una sola suscripción activa por tenant: crear de nuevo reemplaza y cancela la anterior", async () => {
    const cobro = crearProveedorCobro();
    const tenant = `mem-r-${Date.now().toString(36)}`;
    const primera = await cobro.crearSuscripcion({ tenantId: tenant, planId: "basico" });
    const segunda = await cobro.crearSuscripcion({ tenantId: tenant, planId: "plus" });
    expect((await cobro.estado(primera.id)).estado).toBe("cancelada");
    expect((await cobro.estado(segunda.id)).estado).toBe("activa");
    expect(await leerSuscripcionActiva(tenant)).toEqual(segunda);
  });

  it("los contadores acumulan usado y costo por tenant, mes y feature (PLAN-S10)", async () => {
    const tenant = `mem-u-${Date.now().toString(36)}`;
    await registrarUso({ tenantId: tenant, mes: "2026-10", feature: "bot_consulta", cantidad: 10, costoCentavos: 26n });
    await registrarUso({ tenantId: tenant, mes: "2026-10", feature: "bot_consulta", cantidad: 3, costoCentavos: 8n });
    expect(await leerUso({ tenantId: tenant, mes: "2026-10", feature: "bot_consulta" })).toEqual({
      usado: 13,
      costoCentavos: 0n,
    });
    expect(await leerUso({ tenantId: `${tenant}-otro`, mes: "2026-10", feature: "bot_consulta" })).toBe(null);
    expect(await leerUso({ tenantId: tenant, mes: "2026-09", feature: "bot_consulta" })).toBe(null);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const uuidA = randomUUID();
const uuidB = randomUUID();

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function asegurarTenantDb(tenant: "tenant-a" | "tenant-b", id: string) {
  await conTenant(tenant, async () => {
    await getTenantDb()
      .insert(tenants)
      .values({ id, nombreComercio: `Planes ${sufijoPG}`, slug: `planes-${sufijoPG}-${tenant}` })
      .onConflictDoNothing();
  });
}

async function borrarRastroPG() {
  for (const [tenant, id] of [["tenant-a", uuidA], ["tenant-b", uuidB]] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      await db.delete(usageCounters).where(eq(usageCounters.tenantId, id));
      await db.delete(subscriptions).where(eq(subscriptions.tenantId, id));
      await db.delete(tenants).where(eq(tenants.id, id));
    });
  }
}

describe.skipIf(!hayPG)("PLAN-S1/S10 PG: catálogo desde DB, una activa y contadores aislados A/B", () => {
  beforeAll(async () => {
    fijarMulti();
    olvidarPlanesEnMemoria();
    await asegurarTenantDb("tenant-a", uuidA);
    await asegurarTenantDb("tenant-b", uuidB);
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("el catálogo sale de plans+plan_features con la semilla de ejemplo", async () => {
    fijarMulti();
    const catalogo = await conTenant("tenant-a", () => leerCatalogo());
    expect(catalogo.map((p) => p.id)).toEqual(["basico", "plus", "pro"]);
    expect(catalogo.find((p) => p.id === "basico")?.cupos.bot_consulta).toBe(100);
  });

  it("planIncluye aísla tenants: A en Básico niega asistente_ia, B en Plus lo afirma", async () => {
    fijarMulti();
    await conTenant("tenant-a", () => crearProveedorCobro().crearSuscripcion({ tenantId: uuidA, planId: "basico" }));
    await conTenant("tenant-b", () => crearProveedorCobro().crearSuscripcion({ tenantId: uuidB, planId: "plus" }));
    await conTenant("tenant-a", async () => {
      expect(await planIncluye(uuidA, "asistente_ia")).toEqual({ incluida: false, cupo: null, planId: "basico" });
    });
    await conTenant("tenant-b", async () => {
      expect(await planIncluye(uuidB, "asistente_ia")).toEqual({ incluida: true, cupo: null, planId: "plus" });
    });
  });

  it("crear dos veces deja una sola activa en la tabla y cancela la anterior", async () => {
    fijarMulti();
    const primera = await conTenant("tenant-a", () =>
      crearProveedorCobro().crearSuscripcion({ tenantId: uuidA, planId: "basico" }),
    );
    const segunda = await conTenant("tenant-a", () =>
      crearProveedorCobro().crearSuscripcion({ tenantId: uuidA, planId: "plus" }),
    );
    expect(primera.id).not.toBe(segunda.id);
    const filas = await conTenant("tenant-a", async () =>
      getTenantDb().select().from(subscriptions).where(eq(subscriptions.tenantId, uuidA)),
    );
    expect(filas.filter((f) => f.estado === "activa").length).toBe(1);
    expect(filas.find((f) => f.id === primera.id)?.estado).toBe("cancelada");
    expect(filas.find((f) => f.id === segunda.id)?.estado).toBe("activa");
  });

  it("los contadores hacen upsert y B no ve los de A", async () => {
    fijarMulti();
    await conTenant("tenant-a", () =>
      registrarUso({ tenantId: uuidA, mes: "2026-10", feature: "bot_consulta", cantidad: 10, costoCentavos: 26n }),
    );
    await conTenant("tenant-a", () =>
      registrarUso({ tenantId: uuidA, mes: "2026-10", feature: "bot_consulta", cantidad: 3, costoCentavos: 8n }),
    );
    await conTenant("tenant-a", async () => {
      expect(await leerUso({ tenantId: uuidA, mes: "2026-10", feature: "bot_consulta" })).toEqual({
        usado: 13,
        costoCentavos: 0n,
      });
    });
    await conTenant("tenant-b", async () => {
      expect(await leerUso({ tenantId: uuidB, mes: "2026-10", feature: "bot_consulta" })).toBe(null);
    });
  });
});
