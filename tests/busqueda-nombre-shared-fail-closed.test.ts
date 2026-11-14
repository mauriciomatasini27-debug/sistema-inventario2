import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { products } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { consultarNombre, leerFicha } from "../src/lib/repos/busqueda-nombre.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { filaPg, activarTenantPgEnSingle, PG_TENANT_FIXTURE } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "DEFAULT_TENANT_ID"] as const;

function guardarEnv(): Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> {
  const snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restaurarEnv(snap: ReturnType<typeof guardarEnv>): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe.skipIf(!hayPG)("consultarNombre shared PG fail-closed", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const sku = `SH-BUSQ-${Date.now()}`.toUpperCase();
  const term = `unicoshared${Date.now()}`;
  let snap: ReturnType<typeof guardarEnv>;

  beforeAll(async () => {
    snap = guardarEnv();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      await db.insert(products).values(filaPg({ sku, nombre: `Producto ${term} A`, precioCentavos: 100n, stockActual: 3 }, tenantA));
    });
    await conTenant(tenantB, async () => {
      const db = getTenantDb();
      await db
        .insert(products)
        .values(filaPg({ sku: `${sku}-B`, nombre: `Producto ${term} B`, precioCentavos: 100n, stockActual: 9 }, tenantB));
    });
  });

  afterAll(async () => {
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      await db.delete(products).where(eq(products.sku, sku));
    });
    await conTenant(tenantB, async () => {
      const db = getTenantDb();
      await db.delete(products).where(eq(products.sku, `${sku}-B`));
    });
    restaurarEnv(snap);
  });

  beforeEach(() => {
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
  });

  it("sin contexto ni pedido válido no consulta (fail-closed)", async () => {
    const { origen, resolucion } = await consultarNombre({ tenantId: null, texto: `cuantos ${term} tengo` });
    expect(origen).toBe("db");
    expect(resolucion.kind).toBe("sin_resultados");
  });

  it("pedido.tenantId uuid sin ALS resuelve (webhook shared)", async () => {
    const r = await consultarNombre({ tenantId: tenantA, texto: `cuantos ${term} tengo` });
    expect(r.resolucion.kind).toBe("directo");
    if (r.resolucion.kind === "directo") expect(r.resolucion.ficha.sku).toBe(sku);
  });

  it("con contexto A solo ve productos de A", async () => {
    const r = await conTenant(tenantA, () => consultarNombre({ tenantId: tenantA, texto: `cuantos ${term} tengo` }));
    expect(r.resolucion.kind).toBe("directo");
    if (r.resolucion.kind === "directo") {
      expect(r.resolucion.ficha.sku).toBe(sku);
      expect(r.resolucion.ficha.stock).toBe(3);
    }
  });

  it("UUID de contexto inválido en shared no abre la SQL sin filtro", async () => {
    const r = await conTenant("no-es-uuid", () => consultarNombre({ tenantId: "no-es-uuid", texto: `cuantos ${term} tengo` }));
    expect(r.resolucion.kind).toBe("sin_resultados");
    const ficha = await conTenant("no-es-uuid", () => leerFicha({ tenantId: "no-es-uuid", sku }));
    expect(ficha).toBeNull();
  });
});

describe.skipIf(!hayPG)("consultarNombre single PG sin URL", () => {
  const sku = `SN-BUSQ-${Date.now()}`.toUpperCase();
  let snap: ReturnType<typeof guardarEnv>;

  beforeAll(async () => {
    snap = guardarEnv();
    delete process.env.TENANT_MODE;
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
    activarTenantPgEnSingle();
    const db = getTenantDb();
    await db.insert(products).values(
      filaPg({ sku, nombre: "Leche single busq", precioCentavos: 50n, stockActual: 4 }),
    );
  });

  afterAll(async () => {
    const db = getTenantDb();
    await db.delete(products).where(eq(products.sku, sku));
    restaurarEnv(snap);
  });

  it("single con DEFAULT_TENANT_ID sigue resolviendo por nombre", async () => {
    const { resolucion } = await consultarNombre({ tenantId: null, texto: "cuantos leche single busq tengo" });
    expect(resolucion.kind).toBe("directo");
    if (resolucion.kind === "directo") {
      expect(resolucion.ficha.sku).toBe(sku);
    }
    const ficha = await leerFicha({ tenantId: null, sku });
    expect(ficha?.sku).toBe(sku);
    expect(ficha).toMatchObject({ sku, stock: 4 });
    expect(PG_TENANT_FIXTURE).toBeTruthy();
  });
});