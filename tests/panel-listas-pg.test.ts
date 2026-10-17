import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { suppliers } from "../src/db/schema-proveedores.js";
import { customers } from "../src/db/schema-credito.js";
import { GET as GETSuppliers } from "../src/pages/api/suppliers.js";
import { GET as GETCustomers } from "../src/pages/api/credit/customers.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const marca = Date.now().toString(36);
const cuitA = "20" + (marca + "0000000000").replace(/\D/g, "").slice(0, 9);
const nombreA = `ProveedorAislamiento-${marca}`;
const clienteA = `ClienteAislamiento-${marca}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function listarProveedoresDe(tenant: string): Promise<{ items: Array<{ nombre: string }>; fuente: string }> {
  const res = (await conTenant(tenant, () => GETSuppliers(ctx("http://test/api/suppliers")))) as Response;
  expect(res.status).toBe(200);
  return (await res.json()) as { items: Array<{ nombre: string }>; fuente: string };
}

async function listarClientesDe(tenant: string): Promise<{ items: Array<{ nombre: string } & Record<string, unknown>>; fuente: string }> {
  const res = (await conTenant(tenant, () => GETCustomers(ctx("http://test/api/credit/customers")))) as Response;
  expect(res.status).toBe(200);
  return (await res.json()) as { items: Array<{ nombre: string } & Record<string, unknown>>; fuente: string };
}

describe.skipIf(!hayPG)("P3-7d listados del panel: aislamiento por tenant en Postgres", () => {
  beforeAll(() => {
    fijarMulti();
  });

  afterAll(async () => {
    if (hayPG) {
      await conTenant("tenant-a", async () => {
        const db = getTenantDb();
        await db.delete(suppliers).where(eq(suppliers.cuit, cuitA));
        await db.delete(customers).where(eq(customers.nombre, clienteA));
      });
    }
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("el proveedor de A aparece en A y B nunca lo ve", async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(suppliers).values({ cuit: cuitA, nombre: nombreA });
    });

    const a = await listarProveedoresDe("tenant-a");
    expect(a.fuente).toBe("db");
    expect(a.items.some((i) => i.nombre === nombreA)).toBe(true);

    const b = await listarProveedoresDe("tenant-b");
    expect(b.items.some((i) => i.nombre === nombreA)).toBe(false);
  });

  it("el cliente de A aparece en A y B nunca lo ve", async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(customers).values({ nombre: clienteA });
    });

    const a = await listarClientesDe("tenant-a");
    expect(a.fuente).toBe("db");
    const encontrado = a.items.find((i) => i.nombre === clienteA);
    expect(encontrado).toBeDefined();
    expect(encontrado).not.toHaveProperty("telefono");
    expect(encontrado).not.toHaveProperty("dni");

    const b = await listarClientesDe("tenant-b");
    expect(b.items.some((i) => i.nombre === clienteA)).toBe(false);
  });
});
