import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { customerMovements, customers } from "../src/db/schema-credito.js";
import { emailOutbox } from "../src/db/schema-email.js";
import { getTenantDb } from "../src/lib/db.js";
import { encolarEnvio } from "../src/lib/repos/email.js";
import { crearVencimiento, listarVencimientos } from "../src/lib/repos/caja.js";
import { altaClienteRapida, listarClientes, saldoCliente } from "../src/lib/repos/fiado.js";
import { altaProveedor, listarProveedores } from "../src/lib/repos/proveedores.js";
import { contactoPorNumero, guardarContacto } from "../src/lib/repos/proveedor-wa.js";
import { dondeTenant } from "../src/lib/tenant-scope.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { proveedorContactos } from "../src/db/schema-proveedores.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;

function guardarEnv(): Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> {
  const snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restaurarEnv(snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("P1-81 periferia shared en memoria", () => {
  let snap = guardarEnv();

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    delete process.env.TENANT_DATABASE_URL;
  });

  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  it("sin conTenant en shared, getTenantDb falla cerrado", async () => {
    process.env.TENANT_DATABASE_URL = "postgres://unused/local";
    expect(() => getTenantDb()).toThrow(/Falta tenant/);
  });
});

describe.skipIf(!hayPG)("P1-81 periferia shared en Postgres", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let snap = guardarEnv();

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(async () => {
    restaurarEnv(snap);
    resetStore();
  });

  it("fiado: B no ve clientes ni saldos de A", async () => {
    const tel = "+54911" + randomUUID().replace(/-/g, "").slice(0, 8);
    const alta = await conTenant(tenantA, () => altaClienteRapida({ nombre: `Cli-${randomUUID().slice(0, 6)}`, telefono: tel }));
    expect(alta.ok).toBe(true);
    if (!alta.ok) return;

    const listaB = await conTenant(tenantB, () => listarClientes());
    expect(listaB.clientes.every((c) => c.customerId !== alta.customerId)).toBe(true);

    const saldoB = await conTenant(tenantB, () => saldoCliente(alta.customerId, Date.now()));
    expect(saldoB.existe).toBe(false);
  });

  it("proveedores: mismo CUIT en A y B sin chocar", async () => {
    const cuit = "20933331726";
    const rA = await conTenant(tenantA, () => altaProveedor({ cuit, nombre: "Prov A", ahoraIso: new Date().toISOString() }));
    const rB = await conTenant(tenantB, () => altaProveedor({ cuit, nombre: "Prov B", ahoraIso: new Date().toISOString() }));
    expect(rA.ok).toBe(true);
    expect(rB.ok).toBe(true);

    const listaA = await conTenant(tenantA, () => listarProveedores());
    const listaB = await conTenant(tenantB, () => listarProveedores());
    expect(listaA.proveedores.some((p) => p.cuit === cuit && p.nombre === "Prov A")).toBe(true);
    expect(listaB.proveedores.some((p) => p.cuit === cuit && p.nombre === "Prov B")).toBe(true);
    expect(listaA.proveedores.some((p) => p.nombre === "Prov B")).toBe(false);
  });

  it("email outbox: destino aislado por tenant", async () => {
    const keyA = `resumen-a-${randomUUID()}`;
    const keyB = `resumen-b-${randomUUID()}`;
    await conTenant(tenantA, () => encolarEnvio({ key: keyA, stream: "test", to: "a@test.local", plantilla: "t", vars: {} }));
    await conTenant(tenantB, () => encolarEnvio({ key: keyB, stream: "test", to: "b@test.local", plantilla: "t", vars: {} }));

    const filasA = await conTenant(tenantA, () =>
      getTenantDb()
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.idempotencyKey, keyA)),
    );
    const filasBEnA = await conTenant(tenantA, () =>
      getTenantDb()
        .select()
        .from(emailOutbox)
        .where(dondeTenant(emailOutbox.tenantId, eq(emailOutbox.idempotencyKey, keyB))),
    );
    expect(filasA).toHaveLength(1);
    expect(filasA[0]?.destinatario).toBe("a@test.local");
    expect(filasBEnA).toHaveLength(0);
  });

  it("proveedor WA: mismo numero_e164 en dos tenants", async () => {
    const num = "+54911" + randomUUID().replace(/-/g, "").slice(0, 8);
    await conTenant(tenantA, () =>
      guardarContacto({ numeroE164: num, tenantId: tenantA, supplierCuit: null, estado: "verificado", creadoEn: new Date().toISOString() }),
    );
    await conTenant(tenantB, () =>
      guardarContacto({ numeroE164: num, tenantId: tenantB, supplierCuit: null, estado: "verificado", creadoEn: new Date().toISOString() }),
    );

    const a = await conTenant(tenantA, () => contactoPorNumero(num));
    const b = await conTenant(tenantB, () => contactoPorNumero(num));
    expect(a?.tenantId).toBe(tenantA);
    expect(b?.tenantId).toBe(tenantB);
  });

  it("caja vencimientos: B no ve los de A", async () => {
    await conTenant(tenantA, () =>
      crearVencimiento({ concepto: "Alquiler A", venceEl: "2030-01-15", montoCentavos: 50_000 }),
    );
    const venA = await conTenant(tenantA, () => listarVencimientos());
    const venB = await conTenant(tenantB, () => listarVencimientos());
    expect(venA.some((v) => v.concepto === "Alquiler A")).toBe(true);
    expect(venB.some((v) => v.concepto === "Alquiler A")).toBe(false);
  });

  it("customer_movements: idempotency por tenant", async () => {
    const cid = randomUUID();
    const key = `mov-shared-${randomUUID()}`;
    await conTenant(tenantA, async () => {
      await getTenantDb().insert(customers).values(filaPg({ id: cid, nombre: "Iso A", topeCentavos: 0n }, tenantA));
      await getTenantDb().insert(customerMovements).values(
        filaPg(
          { customerId: cid, tipo: "inicial", debeCentavos: 100n, haberCentavos: 0n, idempotencyKey: key, clientOccurredAt: new Date() },
          tenantA,
        ),
      );
    });
    await conTenant(tenantB, async () => {
      await getTenantDb().insert(customerMovements).values(
        filaPg(
          { customerId: cid, tipo: "inicial", debeCentavos: 200n, haberCentavos: 0n, idempotencyKey: key, clientOccurredAt: new Date() },
          tenantB,
        ),
      );
    });
    const enA = await conTenant(tenantA, () =>
      getTenantDb()
        .select()
        .from(customerMovements)
        .where(dondeTenant(customerMovements.tenantId, eq(customerMovements.idempotencyKey, key))),
    );
    const enB = await conTenant(tenantB, () =>
      getTenantDb()
        .select()
        .from(customerMovements)
        .where(dondeTenant(customerMovements.tenantId, eq(customerMovements.idempotencyKey, key))),
    );
    expect(enA).toHaveLength(1);
    expect(enB).toHaveLength(1);
    expect(enA[0]?.debeCentavos).toBe(100n);
    expect(enB[0]?.debeCentavos).toBe(200n);
  });
});