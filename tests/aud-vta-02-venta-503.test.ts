import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { products, sales } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearLote } from "../src/lib/repos/lotes.js";
import { BaseNoDisponible } from "../src/lib/server-db.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";
import { ctx } from "./helpers/ctx.js";

// AUD-VTA-02: si la base falla dentro de la tx de la venta, en shared la venta
// no se confirma en memoria: registrar_venta lanza BaseNoDisponible y
// POST /api/sales responde 503. En single el respaldo en memoria no cambia.

const PG = process.env.PG_TEST_URL_A;
const ENV = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL", "DEFAULT_TENANT_ID"] as const;
const PREFIJO = "aud-vta-02-falla-";

const nuevoSku = (p: string) => `${p}${randomUUID().slice(0, 8)}`.toUpperCase();

function ejecutar(tenantId: string, q: string) {
  return conTenant(tenantId, () => getTenantDb().execute(sql.raw(q)));
}

async function sembrar(tenantId: string, sku: string, stock: number) {
  await conTenant(tenantId, () =>
    getTenantDb().insert(products).values({ sku, nombre: `AUD ${sku}`, precioCentavos: 1000n, stockActual: stock, tenantId }),
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

async function ventasConKey(tenantId: string, key: string): Promise<number> {
  const f = await conTenant(tenantId, () => getTenantDb().select().from(sales).where(eq(sales.idempotencyKey, key)));
  return f.length;
}

function vender(tenantId: string, key: string, sku: string) {
  return conTenant(tenantId, () =>
    registrar_venta({
      key,
      lineas: [{ product_id: sku, qty: 1, precio_centavos: 1000 }],
      medio: "Efectivo",
      deviceCode: "caja-aud-02",
      seqLocal: 1,
      offline: false,
      clientOccurredAt: new Date().toISOString(),
    }),
  );
}

describe.skipIf(!PG)("AUD-VTA-02 falla de base a mitad de la venta", () => {
  let snap: Record<string, string | undefined> = {};
  const tA = randomUUID();

  beforeAll(async () => {
    process.env.TENANT_DATABASE_URL = PG;
    // AUD-VTA-02: falla inyectada solo para las keys de este archivo; el resto de la suite
    // comparte la base y no la ve.
    await ejecutar(
      tA,
      `CREATE OR REPLACE FUNCTION aud_vta_02_falla() RETURNS trigger AS $$ BEGIN IF NEW.idempotency_key LIKE '${PREFIJO}%' THEN RAISE EXCEPTION 'falla inyectada'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
    );
    await ejecutar(tA, `DROP TRIGGER IF EXISTS aud_vta_02_falla_t ON sales`);
    await ejecutar(tA, `CREATE TRIGGER aud_vta_02_falla_t BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION aud_vta_02_falla()`);
  });
  afterAll(async () => {
    process.env.TENANT_DATABASE_URL = PG;
    await ejecutar(tA, `DROP TRIGGER IF EXISTS aud_vta_02_falla_t ON sales`);
  });

  beforeEach(() => {
    snap = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = PG;
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.DEFAULT_TENANT_ID;
  });
  afterEach(() => {
    for (const k of ENV) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
    resetStore();
  });

  it("shared: lanza BaseNoDisponible, no guarda la venta y no baja stock ni en base ni en memoria", async () => {
    const s = nuevoSku("AUF");
    await sembrar(tA, s, 1);
    const key = `${PREFIJO}${randomUUID()}`;
    await expect(vender(tA, key, s)).rejects.toBeInstanceOf(BaseNoDisponible);
    expect(await stockDe(tA, s)).toBe(1);
    expect(await ventasConKey(tA, key)).toBe(0);
    expect(conTenant(tA, () => [store.idempotency.has(key), store.movements.length])).toEqual([false, 0]);
  });

  it("shared: tampoco confirma en memoria con stock espejado por un ingreso de este proceso", async () => {
    const s = nuevoSku("AUG");
    await sembrar(tA, s, 0);
    const lote = await conTenant(tA, () =>
      crearLote({ sku: s, cantidad: 1, venceEl: null, costoCentavos: 500, controlaVencimiento: false, idemKey: `aud-vta-02-lote-${randomUUID()}` }),
    );
    expect(lote.ok && lote.fuente).toBe("db");
    const key = `${PREFIJO}${randomUUID()}`;
    await expect(vender(tA, key, s)).rejects.toBeInstanceOf(BaseNoDisponible);
    expect(await stockDe(tA, s)).toBe(1);
    expect(conTenant(tA, () => store.idempotency.has(key))).toBe(false);
  });

  it("shared: POST /api/sales responde 503 base_no_disponible", async () => {
    const s = nuevoSku("AUH");
    await sembrar(tA, s, 1);
    const key = `${PREFIJO}${randomUUID()}`;
    const { POST } = await import("../src/pages/api/sales.js");
    const r = (await conTenant(tA, () =>
      POST(
        ctx("http://x/api/sales", {
          headers: { "Idempotency-Key": key },
          body: {
            lineas: [{ product_id: s, qty: 1, precio_centavos: 1000 }],
            medio: "Efectivo",
            device_code: "caja-aud-02",
            seq_local: 1,
            client_occurred_at: new Date().toISOString(),
          },
        }),
      ),
    )) as Response;
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "base_no_disponible" });
    expect(await stockDe(tA, s)).toBe(1);
  });

  it("la misma venta sin falla inyectada sigue entrando por la base", async () => {
    const s = nuevoSku("AUI");
    await sembrar(tA, s, 1);
    const r = await vender(tA, `aud-vta-02-ok-${randomUUID()}`, s);
    expect(r.ok && r.venta.fuente).toBe("db");
    expect(await stockDe(tA, s)).toBe(0);
  });

  it("single: la caída de base sigue cayendo a memoria como antes", async () => {
    delete process.env.TENANT_MODE;
    process.env.DEFAULT_TENANT_ID = tA;
    const s = nuevoSku("AUJ");
    await sembrar(tA, s, 1);
    store.stock.set(s, 1);
    const r = await vender(tA, `${PREFIJO}${randomUUID()}`, s);
    expect(r.ok && r.venta.fuente).toBe("memoria");
  });
});
