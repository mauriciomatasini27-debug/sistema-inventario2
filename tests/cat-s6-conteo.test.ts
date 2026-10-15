import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { productCodes, products, stockCountLines, stockCounts, stockLots, stockMovements } from "../src/db/schema.js";
import { POST as POSTLots } from "../src/pages/api/lots.js";
import { POST as POSTProducts } from "../src/pages/api/products.js";
import { POST as POSTCounts, PATCH as PATCHCounts } from "../src/pages/api/counts.js";
import { POST as POSTConfirmar } from "../src/pages/api/counts/[id]/confirmar.js";
import { listarMovimientos, nivelStock } from "../src/lib/repos/stock.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

async function crearConteo(sku: string, fisico: number, key: string) {
  const r = (await POSTCounts(
    ctx("http://x/api/counts", {
      body: { contado_por: "emp1", lineas: [{ sku, fisico }] },
      headers: { "Idempotency-Key": key },
    }),
  )) as Response;
  expect(r.status).toBe(201);
  const j = (await r.json()) as {
    id: string;
    estado: string;
    diferencias: Array<{ sku: string; teorico: number; fisico: number; diferencia: number }>;
  };
  expect(j.estado).toBe("en_curso");
  return j;
}

beforeEach(() => {
  modoSingleSinDb();
  resetStore();
});

describe("CAT-S6 conteo en dos roles + AJUSTE_CONTEO", () => {
  it("crea conteo en_curso con diferencias stock 10 fisico 8", async () => {
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "S6-A", cantidad: 10 } }));
    expect(nivelStock("S6-A")).toBe(10);
    const j = await crearConteo("S6-A", 8, "s6-k1");
    expect(j.diferencias).toEqual([{ sku: "S6-A", teorico: 10, fisico: 8, diferencia: -2 }]);
  });

  it("empleado confirma a listo_revisar sin mover stock ni crear movimientos", async () => {
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "S6-B", cantidad: 10 } }));
    const movsAntes = (await listarMovimientos()).filter((m) => m.sku === "S6-B").length;
    const j = await crearConteo("S6-B", 8, "s6-k2");
    const p = (await PATCHCounts(
      ctx(`http://x/api/counts?id=${j.id}`, { method: "PATCH", body: { rol: "empleado", confirmado_por: "emp1" } }),
    )) as Response;
    expect(p.status).toBe(200);
    expect(await p.json()).toEqual({ id: j.id, estado: "listo_revisar" });
    expect(nivelStock("S6-B")).toBe(10);
    expect((await listarMovimientos()).filter((m) => m.sku === "S6-B").length).toBe(movsAntes);
    const listo = store.auditoria.filter((a) => a.accion === "conteo_listo_revisar");
    expect(listo).toHaveLength(1);
    expect(listo[0]).toMatchObject({ countId: j.id, contadoPor: "emp1", confirmadoPor: "emp1" });
  });

  it("dueno sin motivo 422; con motivo confirma con un AJUSTE_CONTEO y audita", async () => {
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "S6-C", cantidad: 10 } }));
    const j = await crearConteo("S6-C", 8, "s6-k3");
    const sin = (await PATCHCounts(
      ctx(`http://x/api/counts?id=${j.id}`, { method: "PATCH", body: { rol: "dueno", confirmado_por: "due1" } }),
    )) as Response;
    expect(sin.status).toBe(422);
    const auditAntes = store.auditoria.length;
    const p = (await PATCHCounts(
      ctx(`http://x/api/counts?id=${j.id}`, {
        method: "PATCH",
        body: { rol: "dueno", confirmado_por: "due1", motivo: "faltante góndola" },
      }),
    )) as Response;
    expect(p.status).toBe(200);
    expect(await p.json()).toEqual({ id: j.id, estado: "confirmado", motivo: "faltante góndola" });
    expect(nivelStock("S6-C")).toBe(8);
    const movs = (await listarMovimientos()).filter((m) => m.sku === "S6-C" && m.idemKey.startsWith(`conteo:${j.id}:`));
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: "AJUSTE_CONTEO", delta: -2, motivo: "faltante góndola" });
    const audits = store.auditoria.filter((a) => a.accion === "conteo_confirmado");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ countId: j.id, contadoPor: "emp1", confirmadoPor: "due1", motivo: "faltante góndola" });
    expect(store.auditoria.length).toBe(auditAntes + 1);
  });

  it("empleado luego dueno: listo_revisar y despues confirmado con AJUSTE_CONTEO", async () => {
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "S6-D", cantidad: 10 } }));
    const j = await crearConteo("S6-D", 8, "s6-k4");
    const e = (await PATCHCounts(
      ctx(`http://x/api/counts?id=${j.id}`, { method: "PATCH", body: { rol: "empleado", confirmado_por: "emp1" } }),
    )) as Response;
    expect(e.status).toBe(200);
    expect(nivelStock("S6-D")).toBe(10);
    const d = (await POSTConfirmar(
      ctx(`http://x/api/counts/${j.id}/confirmar`, {
        method: "POST",
        body: { rol: "dueno", confirmado_por: "due1", motivo: "quiebre" },
        params: { id: j.id },
      }),
    )) as Response;
    expect(d.status).toBe(200);
    expect(await d.json()).toEqual({ id: j.id, estado: "confirmado", motivo: "quiebre" });
    expect(nivelStock("S6-D")).toBe(8);
    const movs = (await listarMovimientos()).filter((m) => m.sku === "S6-D" && m.idemKey.startsWith(`conteo:${j.id}:`));
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: "AJUSTE_CONTEO", motivo: "quiebre" });
  });

  it("alias POST /api/counts/[id]/confirmar para empleado deja listo_revisar sin mover stock", async () => {
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "S6-E", cantidad: 10 } }));
    const j = await crearConteo("S6-E", 8, "s6-k5");
    const p = (await POSTConfirmar(
      ctx(`http://x/api/counts/${j.id}/confirmar`, {
        method: "POST",
        body: { rol: "empleado", confirmado_por: "emp1" },
        params: { id: j.id },
      }),
    )) as Response;
    expect(p.status).toBe(200);
    expect(await p.json()).toEqual({ id: j.id, estado: "listo_revisar" });
    expect(nivelStock("S6-E")).toBe(10);
  });

  it("misma Idempotency-Key en crear da 409", async () => {
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "S6-F", cantidad: 10 } }));
    await crearConteo("S6-F", 8, "s6-k6");
    const dup = (await POSTCounts(
      ctx("http://x/api/counts", {
        body: { contado_por: "emp1", lineas: [{ sku: "S6-F", fisico: 8 }] },
        headers: { "Idempotency-Key": "s6-k6" },
      }),
    )) as Response;
    expect(dup.status).toBe(409);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 12);
const skuPG = `S6P${sufijoPG}`.toUpperCase().slice(0, 32);
const keyConteoPG = `s6-conteo-${sufijoPG}`;
const keyLotePG = `s6-lote-${sufijoPG}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("CAT-S6 PG smoke: empleado listo_revisar y dueño AJUSTE_CONTEO en stock_movements", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const cab = await db.select({ id: stockCounts.id }).from(stockCounts).where(eq(stockCounts.idemKey, keyConteoPG));
      for (const c of cab) await db.delete(stockCountLines).where(eq(stockCountLines.countId, c.id));
      await db.delete(stockCounts).where(eq(stockCounts.idemKey, keyConteoPG));
      await db.delete(stockMovements).where(eq(stockMovements.sku, skuPG));
      await db.delete(stockLots).where(eq(stockLots.sku, skuPG));
      await db.delete(productCodes).where(eq(productCodes.sku, skuPG));
      await db.delete(products).where(eq(products.sku, skuPG));
    });
    modoSingleSinDb();
  });

  it("empleado deja listo_revisar sin movimientos; dueño confirma con un AJUSTE_CONTEO y stock 8", async () => {
    fijarMulti();
    const rp = (await conTenant("tenant-a", () =>
      POSTProducts(ctx("http://x/api/products", { body: { sku: skuPG, nombre: "Conteo S6", precio_centavos: 1000 } })),
    )) as Response;
    expect(rp.status).toBe(201);
    const rl = (await conTenant("tenant-a", () =>
      POSTLots(ctx("http://x/api/lots", { body: { sku: skuPG, cantidad: 10 }, headers: { "Idempotency-Key": keyLotePG } })),
    )) as Response;
    expect(rl.status).toBe(201);
    const rc = (await conTenant("tenant-a", () =>
      POSTCounts(
        ctx("http://x/api/counts", {
          body: { contado_por: "emp1", lineas: [{ sku: skuPG, fisico: 8 }] },
          headers: { "Idempotency-Key": keyConteoPG },
        }),
      ),
    )) as Response;
    expect(rc.status).toBe(201);
    const cj = (await rc.json()) as { id: string };
    const ajustes = () =>
      conTenant("tenant-a", async () =>
        getTenantDb()
          .select()
          .from(stockMovements)
          .where(and(eq(stockMovements.sku, skuPG), eq(stockMovements.tipo, "AJUSTE_CONTEO"))),
      );

    const re = (await conTenant("tenant-a", () =>
      POSTConfirmar(
        ctx(`http://x/api/counts/${cj.id}/confirmar`, {
          method: "POST",
          body: { rol: "empleado", confirmado_por: "emp1" },
          params: { id: cj.id },
        }),
      ),
    )) as Response;
    expect(re.status).toBe(200);
    const cabE = await conTenant("tenant-a", async () => getTenantDb().select().from(stockCounts).where(eq(stockCounts.id, cj.id)));
    expect(cabE[0]?.estado).toBe("listo_revisar");
    expect(await ajustes()).toHaveLength(0);

    const rd = (await conTenant("tenant-a", () =>
      PATCHCounts(
        ctx(`http://x/api/counts?id=${cj.id}`, { method: "PATCH", body: { rol: "dueno", confirmado_por: "due1", motivo: "faltante" } }),
      ),
    )) as Response;
    expect(rd.status).toBe(200);
    const cabD = await conTenant("tenant-a", async () => getTenantDb().select().from(stockCounts).where(eq(stockCounts.id, cj.id)));
    expect(cabD[0]?.estado).toBe("confirmado");
    const movs = await ajustes();
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: "AJUSTE_CONTEO", delta: -2, motivo: "faltante" });
    const prod = await conTenant("tenant-a", async () =>
      getTenantDb().select({ stockActual: products.stockActual }).from(products).where(eq(products.sku, skuPG)),
    );
    expect(prod[0]?.stockActual).toBe(8);
  });
});
