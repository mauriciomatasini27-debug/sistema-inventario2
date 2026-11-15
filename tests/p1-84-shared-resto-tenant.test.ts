import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { payees } from "../src/db/schema-pagos.js";
import { serviceAccounts } from "../src/db/schema-servicios.js";
import { saleReturns } from "../src/db/schema-tickets.js";
import { sales } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { listarCuentasDetalle } from "../src/lib/repos/servicios.js";
import { leerResumenPanel } from "../src/lib/repos/panel.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";
import { eq } from "drizzle-orm";

const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
const hayPG = Boolean(process.env.PG_TEST_URL_A);

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

describe.skipIf(!hayPG)("P1-84 shared: resto de tablas aisladas por tenant", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const keyVenta = `p84-v-${randomUUID()}`;
  const keyRet = `p84-r-${randomUUID()}`;
  const numDev = `D-P84-${randomUUID().slice(0, 8)}`;
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(async () => {
    try {
      await conTenant(tenantA, async () => {
        const db = getTenantDb();
        await db.delete(saleReturns).where(eq(saleReturns.idempotencyKey, keyRet));
        await db.delete(sales).where(eq(sales.idempotencyKey, keyVenta));
        await db.delete(payees).where(eq(payees.nombre, "P84-payee-A"));
        await db.delete(serviceAccounts).where(eq(serviceAccounts.titular, "P84-cuenta-A"));
      });
      await conTenant(tenantB, async () => {
        const db = getTenantDb();
        await db.delete(serviceAccounts).where(eq(serviceAccounts.titular, "P84-cuenta-B"));
      });
    } finally {
      restaurarEnv(snap);
      resetStore();
    }
  });

  it("B no ve devolución, payee ni cuenta de A", async () => {
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      const [v] = await db
        .insert(sales)
        .values(filaPg({ idempotencyKey: keyVenta, medio: "Efectivo", totalCentavos: 1000n, clientOccurredAt: new Date() }, tenantA))
        .returning({ id: sales.id });
      await db.insert(saleReturns).values(
        filaPg(
          {
            idempotencyKey: keyRet,
            saleId: v!.id,
            numeroDevolucion: numDev,
            montoCentavos: 99n,
            acumuladoNuevoCentavos: 99n,
            medio: "Efectivo",
            motivo: "p84",
            actor: "test",
          },
          tenantA,
        ),
      );
      await db.insert(payees).values(filaPg({ nombre: "P84-payee-A", tipo: "proveedor", medioPreferido: "Transferencia" }, tenantA));
      await db.insert(serviceAccounts).values(
        filaPg({ servicio: "luz", proveedor: "Edenor", titular: "P84-cuenta-A", activa: true }, tenantA),
      );
    });
    await conTenant(tenantB, async () => {
      const db = getTenantDb();
      await db.insert(serviceAccounts).values(
        filaPg({ servicio: "gas", proveedor: "Metrogas", titular: "P84-cuenta-B", activa: true }, tenantB),
      );
    });

    const panelB = await conTenant(tenantB, () => leerResumenPanel());
    expect(panelB.datos.devoluciones.some((d) => d.montoCentavos === 99n)).toBe(false);

    const cuentasB = await conTenant(tenantB, () => listarCuentasDetalle());
    expect(cuentasB.some((c) => c.titular === "P84-cuenta-A")).toBe(false);
    expect(cuentasB.some((c) => c.titular === "P84-cuenta-B")).toBe(true);

    const payeesB = await conTenant(tenantB, async () => {
      const { dondeTenant } = await import("../src/lib/tenant-scope.js");
      return getTenantDb().select().from(payees).where(dondeTenant(payees.tenantId));
    });
    expect(payeesB.some((p) => p.nombre === "P84-payee-A")).toBe(false);
  });
});
