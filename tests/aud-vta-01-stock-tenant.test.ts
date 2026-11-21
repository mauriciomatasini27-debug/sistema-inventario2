import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { products, ticketLines } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { registrar_venta, type LineaVentaInput } from "../src/modules/sales/registro_venta.js";

// AUD-VTA-01: en shared el mismo SKU existe en varios comercios. Vender en A no
// toca el stock de B y la línea del ticket apunta al producto de A.

const PG = process.env.PG_TEST_URL_A;
const ENV = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;

const nuevoSku = (p: string) => `${p}${randomUUID().slice(0, 8)}`.toUpperCase();

async function sembrar(tenantId: string, sku: string, stock: number, origen?: "alta_al_vender") {
  await conTenant(tenantId, () =>
    getTenantDb()
      .insert(products)
      .values({ sku, nombre: `AUD ${sku}`, precioCentavos: 1000n, stockActual: stock, tenantId, ...(origen ? { origen } : {}) }),
  );
}

async function stockDe(tenantId: string, sku: string): Promise<number | undefined> {
  const f = await conTenant(tenantId, () =>
    getTenantDb()
      .select({ s: products.stockActual })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.sku, sku))),
  );
  return f[0]?.s;
}

function vender(tenantId: string, lineas: LineaVentaInput[]) {
  return conTenant(tenantId, () =>
    registrar_venta({
      key: `aud-vta-01-${randomUUID()}`,
      lineas,
      medio: "Efectivo",
      deviceCode: "caja-aud-01",
      seqLocal: 1,
      offline: false,
      clientOccurredAt: new Date().toISOString(),
    }),
  );
}

async function tenantDelProductoDeLaLinea(tenantId: string, saleId: string): Promise<string | undefined> {
  const lineas = await conTenant(tenantId, () =>
    getTenantDb().select().from(ticketLines).where(eq(ticketLines.saleId, saleId)),
  );
  const prod = await conTenant(tenantId, () =>
    getTenantDb().select().from(products).where(eq(products.id, lineas[0]!.productId)),
  );
  return prod[0]?.tenantId;
}

describe.skipIf(!PG)("AUD-VTA-01 venta en shared: stock y ticket por comercio", () => {
  let snap: Record<string, string | undefined> = {};
  const tA = randomUUID();
  const tB = randomUUID();
  const tC = randomUUID();

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

  it("vender un SKU en A baja solo el stock de A, no el de B ni el de C", async () => {
    const s = nuevoSku("AUT");
    await sembrar(tA, s, 10);
    await sembrar(tB, s, 10);
    await sembrar(tC, s, 4);
    const r = await vender(tA, [{ product_id: s, qty: 3, precio_centavos: 1000 }]);
    expect(r.ok && r.venta.fuente).toBe("db");
    expect([await stockDe(tA, s), await stockDe(tB, s), await stockDe(tC, s)]).toEqual([7, 10, 4]);
  });

  it("venta de varias líneas: cada SKU baja solo en el comercio que vende", async () => {
    const [x, y] = [nuevoSku("AUX"), nuevoSku("AUY")];
    await sembrar(tA, x, 5);
    await sembrar(tA, y, 5);
    await sembrar(tB, x, 5);
    await sembrar(tB, y, 5);
    const r = await vender(tB, [
      { product_id: x, qty: 2, precio_centavos: 1000 },
      { product_id: y, qty: 1, precio_centavos: 1000 },
    ]);
    expect(r.ok).toBe(true);
    expect([await stockDe(tA, x), await stockDe(tA, y)]).toEqual([5, 5]);
    expect([await stockDe(tB, x), await stockDe(tB, y)]).toEqual([3, 4]);
  });

  it.each([
    ["A primero", true],
    ["B primero", false],
  ])("la línea del ticket apunta al producto del comercio que vende (%s)", async (_n, aPrimero) => {
    const s = nuevoSku("AUI");
    if (aPrimero) {
      await sembrar(tA, s, 10);
      await sembrar(tB, s, 10);
    } else {
      await sembrar(tB, s, 10);
      await sembrar(tA, s, 10);
    }
    const r = await vender(tA, [{ product_id: s, qty: 1, precio_centavos: 1000 }]);
    if (!r.ok) throw new Error(`venta rechazada: ${r.codigo}`);
    expect(await tenantDelProductoDeLaLinea(tA, r.venta.saleId)).toBe(tA);
  });

  it("un provisorio de alta al vender en B no habilita sobreventa en A", async () => {
    const s = nuevoSku("AUP");
    await sembrar(tB, s, 0, "alta_al_vender");
    await sembrar(tA, s, 0);
    const r = await vender(tA, [{ product_id: s, qty: 1, precio_centavos: 1000 }]);
    expect(r.ok ? "ok" : r.codigo).toBe("SIN_STOCK");
    expect([await stockDe(tA, s), await stockDe(tB, s)]).toEqual([0, 0]);
  });
});
