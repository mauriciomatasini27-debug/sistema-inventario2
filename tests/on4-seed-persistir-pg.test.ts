import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { resetStore } from "../src/lib/store.js";
import { tenantLocationSeeds } from "../src/db/schema-planes.js";
import { leerSembradasPorRubro, registrarSiembraUbicaciones } from "../src/lib/repos/siembra-ubicaciones.js";
import { GET as getLocations } from "../src/pages/api/locations.js";
import { ctx } from "./helpers/ctx.js";

// ON4-SEED-DB: la siembra por rubro sobrevive un reinicio (memoria vacía) porque
// queda en tenant_location_seeds; A no ve la siembra de B.
const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function limpiar() {
  for (const t of ["tenant-a", "tenant-b"] as const) {
    await conTenant(t, async () => {
      await getTenantDb().delete(tenantLocationSeeds).where(eq(tenantLocationSeeds.tenantId, t));
    });
  }
}

describe.skipIf(!hayPG)("ON4-SEED-DB siembra persistida en Postgres", () => {
  beforeAll(async () => {
    fijarMulti();
    await limpiar();
  });
  afterAll(async () => {
    fijarMulti();
    await limpiar();
  });

  it("registra una vez (idempotente) y la lectura sobrevive al reset de memoria", async () => {
    resetStore();
    expect(await leerSembradasPorRubro("tenant-a")).toBe(false);
    expect(await registrarSiembraUbicaciones("tenant-a", { rubro: "kiosco", version: "v1", cantidad: 6 })).toBe(true);
    expect(await registrarSiembraUbicaciones("tenant-a", { rubro: "otro", version: "v2", cantidad: 0 })).toBe(true);
    const filas = await conTenant("tenant-a", () =>
      getTenantDb().select().from(tenantLocationSeeds).where(eq(tenantLocationSeeds.tenantId, "tenant-a")),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ rubro: "kiosco", plantillaVersion: "v1", cantidad: 6 });
    resetStore();
    expect(await leerSembradasPorRubro("tenant-a")).toBe(true);
    expect(await leerSembradasPorRubro("tenant-b")).toBe(false);
  });

  it("GET /api/locations mantiene la forma y lee la base tras reinicio", async () => {
    resetStore();
    const a = await conTenant("tenant-a", async () => (await getLocations(ctx("http://x/api/locations"))).json());
    expect(a).toMatchObject({ sembradas_por_rubro: true });
    expect(Array.isArray((a as { ubicaciones: unknown }).ubicaciones)).toBe(true);
    const b = await conTenant("tenant-b", async () => (await getLocations(ctx("http://x/api/locations"))).json());
    expect((b as { sembradas_por_rubro: boolean }).sembradas_por_rubro).toBe(false);
  });
});
