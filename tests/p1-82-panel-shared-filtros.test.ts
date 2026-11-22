import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { products, sales } from "../src/db/schema.js";
import { shiftHandovers } from "../src/db/schema-caja.js";
import { saleReturns } from "../src/db/schema-tickets.js";
import { fechaAR } from "../src/lib/fecha-ar.js";
import { getTenantDb } from "../src/lib/db.js";
import { leerResumenPanel } from "../src/lib/repos/panel.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

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

describe.skipIf(!hayPG)("P1-82 panel shared: productos, devoluciones y turnos aislados", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const skuA = `P82A${randomUUID().slice(0, 8)}`.toUpperCase();
  const skuB = `P82B${randomUUID().slice(0, 8)}`.toUpperCase();
  const keyVentaA = `p82-venta-a-${randomUUID()}`;
  const keyRetA = `p82-ret-a-${randomUUID()}`;
  const keyHoA = `p82-ho-a-${randomUUID()}`;
  const keyHoB = `p82-ho-b-${randomUUID()}`;
  const numDevA = `D-P82-${randomUUID().slice(0, 8)}`;
  let snap: ReturnType<typeof guardarEnv> = {};
  let saleIdA = "";

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  afterAll(async () => {
    if (!process.env.PG_TEST_URL_A) return;
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      await db.delete(saleReturns).where(eq(saleReturns.idempotencyKey, keyRetA));
      await db.delete(shiftHandovers).where(inArray(shiftHandovers.idempotencyKey, [keyHoA, keyHoB]));
      if (saleIdA) await db.delete(sales).where(eq(sales.id, saleIdA));
      await db.delete(sales).where(eq(sales.idempotencyKey, keyVentaA));
      await db.delete(products).where(inArray(products.sku, [skuA, skuB]));
    });
  });

  it("B no ve stock, devolución ni turno de A en el resumen", async () => {
    const hoy = fechaAR(new Date());
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      await db.insert(products).values(
        filaPg({ sku: skuA, nombre: "P82 A", precioCentavos: 100n, stockActual: 777, minStock: 1 }, tenantA),
      );
      const [v] = await db
        .insert(sales)
        .values(
          filaPg(
            {
              idempotencyKey: keyVentaA,
              medio: "Efectivo",
              totalCentavos: 50_000n,
              clientOccurredAt: new Date(),
            },
            tenantA,
          ),
        )
        .returning({ id: sales.id });
      saleIdA = v!.id;
      await db.insert(saleReturns).values(
        filaPg(
          {
            idempotencyKey: keyRetA,
            saleId: saleIdA,
            numeroDevolucion: numDevA,
            montoCentavos: 12_345n,
            acumuladoNuevoCentavos: 12_345n,
            medio: "Efectivo",
            motivo: "p1-82",
            actor: "test",
          },
          tenantA,
        ),
      );
      await db.insert(shiftHandovers).values(
        filaPg(
          {
            idempotencyKey: keyHoA,
            fechaJornada: hoy,
            turno: "manana",
            entregadoPor: "dueño-a",
            esperadoCentavos: 1n,
            estado: "pendiente",
          },
          tenantA,
        ),
      );
    });

    await conTenant(tenantB, async () => {
      const db = getTenantDb();
      await db.insert(products).values(
        filaPg({ sku: skuB, nombre: "P82 B", precioCentavos: 100n, stockActual: 3, minStock: 1 }, tenantB),
      );
      await db.insert(shiftHandovers).values(
        filaPg(
          {
            idempotencyKey: keyHoB,
            fechaJornada: hoy,
            turno: "tarde",
            entregadoPor: "dueño-b",
            esperadoCentavos: 2n,
            estado: "pendiente",
          },
          tenantB,
        ),
      );
    });

    const leidoB = await conTenant(tenantB, () => leerResumenPanel());
    expect(leidoB.fuente).toBe("db");
    expect(leidoB.datos.devoluciones.some((d) => d.montoCentavos === 12_345n)).toBe(false);
    expect(leidoB.datos.productos.some((p) => p.stockActual === 777)).toBe(false);
    expect(leidoB.datos.productos.some((p) => p.stockActual === 3)).toBe(true);
    expect(leidoB.datos.turnos.some((t) => t.entregadoPor === "dueño-a")).toBe(false);
    expect(leidoB.datos.turnos.some((t) => t.entregadoPor === "dueño-b")).toBe(true);

    const leidoA = await conTenant(tenantA, () => leerResumenPanel());
    expect(leidoA.datos.devoluciones.some((d) => d.montoCentavos === 12_345n)).toBe(true);
    expect(leidoA.datos.productos.some((p) => p.stockActual === 777)).toBe(true);
    expect(leidoA.datos.turnos.some((t) => t.entregadoPor === "dueño-a")).toBe(true);
  });

  it("sin tenant en shared no mezcla filas: falla cerrado", async () => {
    await expect(leerResumenPanel()).rejects.toThrow(/base_no_disponible|Falta tenant/);
  });
});
