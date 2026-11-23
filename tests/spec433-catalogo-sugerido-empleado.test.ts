import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products } from "../src/db/schema.js";
import { tenantProductSeeds } from "../src/db/schema-planes.js";
import { empleadoConSesion, sesionDe, tenantConMiembro } from "./helpers/alta-catalogo.js";
import { GET as getPlantilla, POST as postPlantilla } from "../src/pages/api/stock/plantilla.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const TENANT = "emp433-a";
const OTRO_TENANT = "emp433-b";
const SKU = "PLT-PILAS-AA";
const NOMBRE = "Pilas AA";

function fijarMulti(): void {
  process.env.TENANT_MODE = "multi";
  process.env[`TENANT_DATABASE_URL_${TENANT}`] = process.env.PG_TEST_URL_A ?? "";
  process.env[`TENANT_DATABASE_URL_${OTRO_TENANT}`] = process.env.PG_TEST_URL_B ?? "";
}

function pedir(plano: string, tenantId: string) {
  return conTenant(tenantId, () =>
    getPlantilla(ctx("http://x/api/stock/plantilla", { headers: { cookie: `__Host-sesion=${plano}` } })),
  ) as Promise<Response>;
}

function sembrar(plano: string, tenantId: string) {
  return conTenant(tenantId, () =>
    postPlantilla(
      ctx("http://x/api/stock/plantilla", {
        headers: { cookie: `__Host-sesion=${plano}` },
        body: { nombres: [NOMBRE] },
      }),
    ),
  ) as Promise<Response>;
}

async function limpiar(): Promise<void> {
  fijarMulti();
  await conTenant(TENANT, async () => {
    const db = getTenantDb();
    await db.delete(products).where(eq(products.sku, SKU));
    await db.delete(tenantProductSeeds).where(eq(tenantProductSeeds.tenantId, TENANT));
  });
  resetStore();
}

describe.skipIf(!hayPG)("spec 433 US 4: catálogo sugerido para Empleado, HTTP + DB", () => {
  beforeAll(async () => {
    await limpiar();
  });

  beforeEach(() => {
    resetStore();
    fijarMulti();
  });

  afterAll(async () => {
    if (!hayPG) return;
    await limpiar();
    delete process.env.TENANT_MODE;
    delete process.env[`TENANT_DATABASE_URL_${TENANT}`];
    delete process.env[`TENANT_DATABASE_URL_${OTRO_TENANT}`];
  });

  it("el Empleado con permisos por defecto ve las sugerencias y siembra en su Comercio", async () => {
    const plano = empleadoConSesion(TENANT, "emp-a", undefined, "kiosco");

    const get = await pedir(plano, TENANT);
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ rubro: "kiosco", version: "v1", sembrado: false });

    const post = await sembrar(plano, TENANT);
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ ok: true, cantidad: 1 });

    const filas = await conTenant(TENANT, () =>
      getTenantDb().select({ sku: products.sku, origen: products.origen }).from(products).where(eq(products.sku, SKU)),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ sku: SKU, origen: "plantilla_rubro" });
    const semillas = await conTenant(TENANT, () =>
      getTenantDb().select().from(tenantProductSeeds).where(eq(tenantProductSeeds.tenantId, TENANT)),
    );
    expect(semillas).toHaveLength(1);

    const despues = await pedir(plano, TENANT);
    expect(((await despues.json()) as { sembrado: boolean }).sembrado).toBe(true);
  });

  it("una membership de otro Comercio no alcanza para ver ni sembrar aquí", async () => {
    tenantConMiembro(TENANT, "dueno-a", "dueno", [], "kiosco");
    tenantConMiembro(OTRO_TENANT, "emp-b", "empleado", [], "kiosco");
    const planoAjeno = sesionDe("emp-b", OTRO_TENANT);

    expect((await pedir(planoAjeno, TENANT)).status).toBe(403);
    expect((await sembrar(planoAjeno, TENANT)).status).toBe(403);
  });
});
