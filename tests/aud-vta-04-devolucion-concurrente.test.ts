import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cashMovements, products, ticketCounters } from "../src/db/schema.js";
import { saleReturns } from "../src/db/schema-tickets.js";
import { getTenantDb } from "../src/lib/db.js";
import { filaContadorTicket } from "../src/lib/repos/ticket-counters.js";
import { registrarDevolucion } from "../src/lib/repos/ventas.js";
import { BaseNoDisponible } from "../src/lib/server-db.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";

// AUD-VTA-04: devoluciones concurrentes de la misma venta se serializan con el
// lock de la venta y releen el acumulado dentro de la tx; stock y caja se
// escriben en esa misma tx.

const PG = process.env.PG_TEST_URL_A;
const ENV = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
const PREFIJO_FALLA = "aud-vta-04-falla-";
const nuevoSku = (p: string) => `${p}${randomUUID().slice(0, 8)}`.toUpperCase();

// AUD-VTA-04: sale_returns.numero_devolucion es único en toda la base pero el
// contador es por comercio; con otros archivos devolviendo en paralelo, el
// comercio de prueba arranca su serie en un tramo propio para no chocar.
async function sembrarContadorDevolucion(tenantId: string): Promise<void> {
  const base = 500_000 + Math.floor(Math.random() * 490_000);
  await conTenant(tenantId, () =>
    getTenantDb().insert(ticketCounters).values(filaContadorTicket("devolucion", base)).onConflictDoNothing(),
  );
}

describe.skipIf(!PG)("AUD-VTA-04 devoluciones concurrentes contra Postgres local (shared)", () => {
  let snap: Record<string, string | undefined> = {};
  const tA = randomUUID();
  const ejecutar = (q: string) => conTenant(tA, () => getTenantDb().execute(sql.raw(q)));

  beforeAll(async () => {
    process.env.TENANT_DATABASE_URL = PG;
    // AUD-VTA-04: falla inyectada solo para las keys de este archivo.
    await ejecutar(
      `CREATE OR REPLACE FUNCTION aud_vta_04_falla() RETURNS trigger AS $$ BEGIN IF NEW.idempotency_key LIKE '${PREFIJO_FALLA}%' THEN RAISE EXCEPTION 'falla inyectada'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
    );
    await ejecutar(`DROP TRIGGER IF EXISTS aud_vta_04_falla_t ON cash_movements`);
    await ejecutar(`CREATE TRIGGER aud_vta_04_falla_t BEFORE INSERT ON cash_movements FOR EACH ROW EXECUTE FUNCTION aud_vta_04_falla()`);
    const modo = process.env.TENANT_MODE;
    process.env.TENANT_MODE = "shared";
    await sembrarContadorDevolucion(tA);
    if (modo === undefined) delete process.env.TENANT_MODE;
    else process.env.TENANT_MODE = modo;
  });
  afterAll(async () => {
    process.env.TENANT_DATABASE_URL = PG;
    await ejecutar(`DROP TRIGGER IF EXISTS aud_vta_04_falla_t ON cash_movements`);
  });

  beforeEach(() => {
    snap = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = PG;
    delete process.env.CONTROL_DATABASE_URL;
  });
  afterEach(() => {
    for (const k of ENV) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
    resetStore();
  });

  async function sembrar(s: string, stock: number) {
    await conTenant(tA, () =>
      getTenantDb().insert(products).values({ sku: s, nombre: `AUD ${s}`, precioCentavos: 1000n, stockActual: stock, tenantId: tA }),
    );
  }
  async function stockDe(s: string): Promise<number | undefined> {
    const f = await conTenant(tA, () =>
      getTenantDb()
        .select({ s: products.stockActual })
        .from(products)
        .where(and(eq(products.tenantId, tA), eq(products.sku, s))),
    );
    return f[0]?.s;
  }
  async function vender(s: string, qty: number): Promise<string> {
    const r = await conTenant(tA, () =>
      registrar_venta({
        key: `aud-vta-04-${randomUUID()}`,
        lineas: [{ product_id: s, qty, precio_centavos: 1000 }],
        medio: "Efectivo",
        deviceCode: "caja-aud-04",
        seqLocal: 1,
        offline: false,
        clientOccurredAt: new Date().toISOString(),
      }),
    );
    if (!r.ok) throw new Error(`venta rechazada: ${r.codigo}`);
    return r.venta.saleId;
  }
  const devolver = (saleId: string, s: string, cantidad: number, monto: bigint, prefijo = "aud-vta-04-dev-") =>
    conTenant(tA, () =>
      registrarDevolucion({
        key: `${prefijo}${randomUUID()}`,
        saleId,
        montoCentavos: monto,
        items: [{ sku: s, cantidad }],
        medio: "Efectivo",
        motivo: "prueba",
        actor: "duena",
        clientOccurredAt: new Date().toISOString(),
      }),
    );
  const egresosDe = (saleId: string) =>
    conTenant(tA, () =>
      getTenantDb()
        .select()
        .from(cashMovements)
        .where(and(eq(cashMovements.saleId, saleId), eq(cashMovements.tipo, "egreso"))),
    );
  const devolucionesDe = (saleId: string) =>
    conTenant(tA, () => getTenantDb().select().from(saleReturns).where(eq(saleReturns.saleId, saleId)));

  it("dos devoluciones simultáneas del total de una venta de $10: pasa una sola", async () => {
    const s = nuevoSku("AUZ");
    await sembrar(s, 10);
    const saleId = await vender(s, 1);
    const rs = await Promise.all([devolver(saleId, s, 1, 1000n), devolver(saleId, s, 1, 1000n)]);
    expect(rs.filter((r) => r.ok).length).toBe(1);
    expect(rs.find((r) => !r.ok)).toMatchObject({ status: 422 });
    expect((await egresosDe(saleId)).map((m) => m.montoCentavos)).toEqual([1000n]);
    expect(await stockDe(s)).toBe(10);
  });

  it("cinco devoluciones simultáneas de 1 unidad sobre una venta de 2: pasan dos", async () => {
    const s = nuevoSku("AUC");
    await sembrar(s, 10);
    const saleId = await vender(s, 2);
    const rs = await Promise.all(Array.from({ length: 5 }, () => devolver(saleId, s, 1, 1000n)));
    expect(rs.filter((r) => r.ok).length).toBe(2);
    expect((await egresosDe(saleId)).length).toBe(2);
    expect(await stockDe(s)).toBe(10);
  });

  it("dos parciales simultáneas que entran juntas pasan las dos con acumulado encadenado", async () => {
    const s = nuevoSku("AUP");
    await sembrar(s, 10);
    const saleId = await vender(s, 2);
    const rs = await Promise.all([devolver(saleId, s, 1, 1000n), devolver(saleId, s, 1, 1000n)]);
    expect(rs.every((r) => r.ok)).toBe(true);
    const filas = await devolucionesDe(saleId);
    expect(filas.map((f) => `${f.acumuladoPrevioCentavos}->${f.acumuladoNuevoCentavos}`).sort()).toEqual(["0->1000", "1000->2000"]);
    expect(await stockDe(s)).toBe(10);
  });

  it("si la caja falla dentro de la tx no queda devolución, ni stock repuesto, ni egreso", async () => {
    const s = nuevoSku("AUF");
    await sembrar(s, 10);
    const saleId = await vender(s, 1);
    await expect(devolver(saleId, s, 1, 1000n, PREFIJO_FALLA)).rejects.toBeInstanceOf(BaseNoDisponible);
    expect(await devolucionesDe(saleId)).toEqual([]);
    expect(await egresosDe(saleId)).toEqual([]);
    expect(await stockDe(s)).toBe(9);
    // AUD-VTA-04: la venta sigue devolvible después de la falla.
    expect((await devolver(saleId, s, 1, 1000n)).ok).toBe(true);
    expect(await stockDe(s)).toBe(10);
  });
});
