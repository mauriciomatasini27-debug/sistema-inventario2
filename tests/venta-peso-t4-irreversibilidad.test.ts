import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, sales, ticketLines } from "../src/db/schema.js";
import { agregarLineaTicket } from "../src/lib/ticket-memoria.js";
import { etiquetaPrecioCatalogo } from "../src/lib/catalogo-panel.js";
import { avisoPorPeso } from "../src/modules/stock/alta-producto-panel.js";
import { GET as getProducts, PATCH as patchProducts, POST as postProducts } from "../src/pages/api/products.js";

const MENSAJE_DOMINIO = /tickets históricos quedarían sin sentido/i;

function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

async function darDeAlta(sku: string, porPeso: boolean): Promise<void> {
  const r = (await postProducts(
    ctx("http://x/api/products", {
      body: { sku, nombre: "Producto T4", precio_centavos: 500000, por_peso: porPeso },
    }),
  )) as Response;
  expect(r.status).toBe(201);
}

async function cambiarFlag(sku: string, porPeso: boolean): Promise<{ status: number; error?: unknown; porPeso?: boolean | undefined }> {
  const r = (await patchProducts(
    ctx(`http://x/api/products?sku=${sku}`, { method: "PATCH", body: { por_peso: porPeso } }),
  )) as Response;
  const j = (await r.json()) as { error?: unknown; por_peso?: boolean };
  return { status: r.status, error: j.error, porPeso: j.por_peso };
}

async function flagActual(sku: string): Promise<boolean | undefined> {
  const r = (await getProducts(ctx(`http://x/api/products?q=${sku}`))) as Response;
  const j = (await r.json()) as { productos: Array<{ sku: string; por_peso: boolean }> };
  return j.productos.find((p) => p.sku === sku)?.por_peso;
}

describe("T4 #388 API: flag irreversible tras la primera venta", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("con ventas, desactivar por_peso se rechaza con 422, mensaje de dominio y el flag queda intacto", async () => {
    await darDeAlta("VP4-VENDIDO", true);
    agregarLineaTicket({ sale_id: "sale-t4-1", product_id: "VP4-VENDIDO", qty: 1250, precio_centavos: "6250" });

    const r = await cambiarFlag("VP4-VENDIDO", false);
    expect(r.status).toBe(422);
    expect(r.error).toBe("No se puede cambiar 'se vende por peso': los tickets históricos quedarían sin sentido.");
    expect(MENSAJE_DOMINIO.test(String(r.error))).toBe(true);
    expect(await flagActual("VP4-VENDIDO")).toBe(true);
  });

  it("sin ventas, el Dueño activa y desactiva el modo libremente", async () => {
    await darDeAlta("VP4-LIBRE", false);

    expect(await cambiarFlag("VP4-LIBRE", true)).toMatchObject({ status: 200, porPeso: true });
    expect(await flagActual("VP4-LIBRE")).toBe(true);
    expect(await cambiarFlag("VP4-LIBRE", false)).toMatchObject({ status: 200, porPeso: false });
    expect(await flagActual("VP4-LIBRE")).toBe(false);
  });

  it("con ventas, las ediciones que no tocan el flag siguen funcionando", async () => {
    await darDeAlta("VP4-OTRO-CAMPO", true);
    agregarLineaTicket({ sale_id: "sale-t4-2", product_id: "VP4-OTRO-CAMPO", qty: 500, precio_centavos: "2500" });

    const r = (await patchProducts(
      ctx("http://x/api/products?sku=VP4-OTRO-CAMPO", { method: "PATCH", body: { nombre: "Papas renamed" } }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { por_peso: boolean }).por_peso).toBe(true);
  });
});

describe("T4 #388 panel: el estado se ve y el rechazo se explica", () => {
  it("el catálogo muestra el flag y la unidad, y el alta avisa que el precio es por kilogramo", () => {
    const tabla = readFileSync("src/components/panel/TablaCatalogo.tsx", "utf8");
    expect(tabla).toContain("etiquetaPrecioCatalogo");
    expect(tabla).toContain("Por peso");
    expect(etiquetaPrecioCatalogo({ precioCentavos: 500000, porPeso: true })).toBe("$ 5.000,00 / kg");

    const alta = readFileSync("src/pages/panel/stock.astro", "utf8");
    expect(alta).toContain('id="alta-por-peso"');
    expect(alta).toContain('id="alta-aviso-por-peso"');
    expect(avisoPorPeso(true)).toContain("centavos por kilogramo");
  });

  it("el rechazo de la API es texto llano que el panel puede mostrar sin traducir", async () => {
    modoSingleSinDb();
    resetStore();
    await darDeAlta("VP4-PANEL", true);
    agregarLineaTicket({ sale_id: "sale-t4-panel", product_id: "VP4-PANEL", qty: 1000, precio_centavos: "5000" });

    const r = await cambiarFlag("VP4-PANEL", false);
    expect(r.status).toBe(422);
    expect(typeof r.error).toBe("string");
    expect(String(r.error)).toMatch(MENSAJE_DOMINIO);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
const skuAislamiento = `VP4I${sufijo}`.toUpperCase().slice(0, 32);
const idProdA = randomUUID();
const idProdB = randomUUID();
const saleB = randomUUID();
const idemB = `vp4-aislamiento-${sufijo}`;

function fijarMulti(): void {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("T4 #388 multi PG: aislamiento por comercio del flag irreversible", () => {
  afterAll(async () => {
    if (hayPG) {
      fijarMulti();
      for (const tenant of ["tenant-a", "tenant-b"] as const) {
        await conTenant(tenant, async () => {
          const db = getTenantDb();
          await db.delete(ticketLines).where(eq(ticketLines.saleId, saleB));
          await db.delete(sales).where(eq(sales.id, saleB));
          await db.delete(products).where(inArray(products.sku, [skuAislamiento]));
        });
      }
    }
    modoSingleSinDb();
  });

  it("las ventas de otro comercio con el mismo SKU no bloquean este producto", async () => {
    fijarMulti();
    resetStore();

    // B vende su producto con este SKU; A tiene el mismo SKU sin ventas.
    await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      await db.insert(products).values(
        filaPg({ id: idProdB, sku: skuAislamiento, nombre: "Vendido B", precioCentavos: 5000n, porPeso: true }),
      );
      await db.insert(sales).values(
        filaPg({
          id: saleB,
          idempotencyKey: idemB,
          medio: "Efectivo",
          totalCentavos: 5000n,
          clientOccurredAt: new Date("2026-11-21T12:00:00.000Z"),
        }),
      );
      await db.insert(ticketLines).values(
        filaPg({ saleId: saleB, productId: idProdB, qty: 1000, precioCentavos: 5000n }),
      );
    });
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(products).values(
        filaPg({ id: idProdA, sku: skuAislamiento, nombre: "Sin ventas A", precioCentavos: 5000n, porPeso: true }),
      );
    });

    const patchA = await conTenant("tenant-a", () => cambiarFlag(skuAislamiento, false));
    expect(patchA.status).toBe(200);
    expect(patchA.porPeso).toBe(false);

    const trasA = await conTenant("tenant-a", async () =>
      getTenantDb().select({ porPeso: products.porPeso }).from(products).where(inArray(products.sku, [skuAislamiento])),
    );
    expect(trasA[0]?.porPeso).toBe(false);

    const patchB = await conTenant("tenant-b", () => cambiarFlag(skuAislamiento, false));
    expect(patchB.status).toBe(422);
    expect(String(patchB.error)).toMatch(MENSAJE_DOMINIO);

    const trasB = await conTenant("tenant-b", async () =>
      getTenantDb().select({ porPeso: products.porPeso }).from(products).where(inArray(products.sku, [skuAislamiento])),
    );
    expect(trasB[0]?.porPeso).toBe(true);
  });
});

const tenantSharedA = randomUUID();
const tenantSharedB = randomUUID();
const skuShared = `VP4S${sufijo}`.toUpperCase().slice(0, 32);
const idSharedA = randomUUID();
const idSharedB = randomUUID();
const saleSharedB = randomUUID();
const idemSharedB = `vp4-shared-${sufijo}`;

const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "TENANT_DATABASE_URL_tenant-a", "TENANT_DATABASE_URL_tenant-b"] as const;
type Snap = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function fijarShared(): Snap {
  const snap: Snap = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  process.env.TENANT_MODE = "shared";
  process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
  return snap;
}

function restaurar(snap: Snap): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe.skipIf(!hayPG)("T4 #388 shared PG: la consulta de ventas filtra por comercio", () => {
  let snap: Snap = {};

  afterAll(async () => {
    if (hayPG) {
      process.env.TENANT_MODE = "shared";
      process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
      await conTenant(tenantSharedA, async () => {
        const db = getTenantDb();
        await db.delete(ticketLines).where(eq(ticketLines.saleId, saleSharedB));
        await db.delete(sales).where(eq(sales.id, saleSharedB));
        await db.delete(products).where(inArray(products.sku, [skuShared]));
      });
    }
    restaurar(snap);
    modoSingleSinDb();
  });

  it("con A y B en la misma base, solo las ventas de B bloquean a B", async () => {
    snap = fijarShared();
    resetStore();
    await conTenant(tenantSharedA, async () => {
      const db = getTenantDb();
      await db.insert(products).values([
        filaPg({ id: idSharedA, sku: skuShared, nombre: "Sin ventas A", precioCentavos: 5000n, porPeso: true }, tenantSharedA),
        filaPg({ id: idSharedB, sku: skuShared, nombre: "Vendido B", precioCentavos: 5000n, porPeso: true }, tenantSharedB),
      ]);
      await db.insert(sales).values(
        filaPg(
          {
            id: saleSharedB,
            idempotencyKey: idemSharedB,
            medio: "Efectivo",
            totalCentavos: 5000n,
            clientOccurredAt: new Date("2026-11-21T12:00:00.000Z"),
          },
          tenantSharedB,
        ),
      );
      await db.insert(ticketLines).values(
        filaPg({ saleId: saleSharedB, productId: idSharedB, qty: 1000, precioCentavos: 5000n }, tenantSharedB),
      );
    });

    const patchA = await conTenant(tenantSharedA, () => cambiarFlag(skuShared, false));
    expect(patchA.status).toBe(200);
    expect(patchA.porPeso).toBe(false);

    const patchB = await conTenant(tenantSharedB, () => cambiarFlag(skuShared, false));
    expect(patchB.status).toBe(422);
    expect(String(patchB.error)).toMatch(MENSAJE_DOMINIO);
  });
});
