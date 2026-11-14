import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { eq } from "drizzle-orm";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { customerMovements, customers } from "../src/db/schema-credito.js";
import { POST as ventaFiadoPOST } from "../src/pages/api/credit/sales-on-account.js";
import { GET as saldoGET } from "../src/pages/api/credit/balance.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const cliente = randomUUID();
const clave = `pers2-key-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

function peticionVenta(claveIdem: string) {
  return ctx("http://test/api/credit/sales-on-account", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": claveIdem },
    body: {
      customer_id: cliente,
      lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
      device_code: "DEV-PERS2-01",
      seq_local: 1,
    },
  });
}

async function borrarCliente() {
  if (!hayPG) return;
  fijarMulti();
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      await db.delete(customerMovements).where(eq(customerMovements.customerId, cliente));
      await db.delete(customers).where(eq(customers.id, cliente));
    });
  }
}

describe.skipIf(!hayPG)("PERS2-S4 Postgres local por tenant", () => {
  beforeAll(() => {
    fijarMulti();
  });

  afterAll(async () => {
    await borrarCliente();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("el fiado de A se lee con fuente db y B no lo ve", async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(customers).values(filaPg({ id: cliente, nombre: "Pers2", topeCentavos: 0n })).onConflictDoNothing();
    });
    const creado = await conTenant("tenant-a", () =>
      ventaFiadoPOST(peticionVenta(clave)),
    );
    expect([201, 409]).toContain(creado.status);

    const saldoA = await conTenant("tenant-a", () =>
      saldoGET(ctx(`http://test/api/credit/balance?customer_id=${cliente}`)),
    );
    expect(saldoA.status).toBe(200);
    const cuerpoA = await saldoA.json();
    expect(cuerpoA.fuente).toBe("db");
    expect(cuerpoA.customer_id).toBe(cliente);
    expect(cuerpoA.saldo_centavos).toBe("15000");

    const saldoB = await conTenant("tenant-b", () =>
      saldoGET(ctx(`http://test/api/credit/balance?customer_id=${cliente}`)),
    );
    expect(saldoB.status).toBe(200);
    const cuerpoB = await saldoB.json();
    expect(cuerpoB.fuente).toBe("db");
    expect(cuerpoB.saldo_centavos).toBe("0");
  });
});
