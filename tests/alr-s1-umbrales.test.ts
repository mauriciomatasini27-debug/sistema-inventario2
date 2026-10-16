import { beforeEach, describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore, store, control } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products } from "../src/db/schema.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as getProducts, POST as postProducts, PATCH as patchProducts } from "../src/pages/api/products.js";
import { POST as postAlertas } from "../src/pages/api/jobs/alertas-stock.js";
import { ejecutar_alertas_stock, limpiar_claves_alertas } from "../src/jobs/alertas-stock.js";
import { ctx } from "./helpers/ctx.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function post(url: string, body: unknown) {
  return ctx(url, { method: "POST", body: body as Record<string, unknown> });
}

function patch(url: string, body: unknown) {
  return ctx(url, { method: "PATCH", body: body as Record<string, unknown> });
}

// P9-13: el rol para umbrales sale de sesión + membership, nunca del body.
function tenantConMiembro(tenantId: string, sub: string, rol: "dueno" | "empleado") {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco Umbrales",
    slug: "kiosco-umbrales",
    estado: "activo",
    plan: "basico",
    moneda: "ARS",
    ownerGoogleSub: "dueno-s1",
    esDemo: false,
  });
  const mid = `m-${tenantId}-${sub}`;
  control.memberships.set(mid, { id: mid, tenantId, googleSub: sub, rol, permisos: [], estado: "activo" });
}

function sesionDe(sub: string, tenantId: string | null): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function patchSesion(url: string, plano: string, body: unknown) {
  return ctx(url, { method: "PATCH", body: body as Record<string, unknown>, headers: { cookie: `__Host-sesion=${plano}` } });
}

async function crearProducto(sku: string, extra: Record<string, unknown> = {}) {
  const r = (await postProducts(post("http://x/api/products", { sku, nombre: `Prod ${sku}`, precio_centavos: 100, ...extra }))) as Response;
  expect(r.status).toBe(201);
}

describe("ALR-S1 PATCH /api/products valida min_stock y reorder_qty", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("min_stock negativo da 422", async () => {
    await crearProducto("UMV-1");
    const r = (await patchProducts(patch("http://x/api/products?sku=UMV-1", { min_stock: -1 }))) as Response;
    expect(r.status).toBe(422);
  });

  it("min_stock no entero da 422", async () => {
    await crearProducto("UMV-2");
    const r = (await patchProducts(patch("http://x/api/products?sku=UMV-2", { min_stock: 2.5 }))) as Response;
    expect(r.status).toBe(422);
  });

  it("reorder_qty cero o negativo da 422", async () => {
    await crearProducto("UMV-3");
    const r0 = (await patchProducts(patch("http://x/api/products?sku=UMV-3", { reorder_qty: 0 }))) as Response;
    expect(r0.status).toBe(422);
    const rNeg = (await patchProducts(patch("http://x/api/products?sku=UMV-3", { reorder_qty: -3 }))) as Response;
    expect(rNeg.status).toBe(422);
  });

  it("valores válidos persisten en memoria y GET los expone", async () => {
    await crearProducto("UMV-4");
    const r = (await patchProducts(patch("http://x/api/products?sku=UMV-4", { min_stock: 5, reorder_qty: 12 }))) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { min_stock: number | null; reorder_qty: number | null };
    expect(j.min_stock).toBe(5);
    expect(j.reorder_qty).toBe(12);
    const g = (await getProducts(ctx("http://x/api/products?q=UMV-4"))) as Response;
    const fichas = ((await g.json()) as { productos: Array<{ sku: string; min_stock: number | null; reorder_qty: number | null }> }).productos;
    expect(fichas.find((f) => f.sku === "UMV-4")).toMatchObject({ min_stock: 5, reorder_qty: 12 });
  });

  it("null limpia los umbrales", async () => {
    await crearProducto("UMV-5", { min_stock: 5, reorder_qty: 12 });
    const r = (await patchProducts(patch("http://x/api/products?sku=UMV-5", { min_stock: null, reorder_qty: null }))) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { min_stock: number | null; reorder_qty: number | null };
    expect(j.min_stock).toBeNull();
    expect(j.reorder_qty).toBeNull();
  });
});

describe("ALR-S1 solo Dueño y encargado editan umbrales", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("empleado recibe 403 al editar min_stock aunque forje rol dueno", async () => {
    tenantConMiembro("t-umbrales", "emp-1", "empleado");
    const plano = sesionDe("emp-1", "t-umbrales");
    await crearProducto("UMR-1");
    const r = (await patchProducts(patchSesion("http://x/api/products?sku=UMR-1", plano, { rol: "dueno", min_stock: 5 }))) as Response;
    expect(r.status).toBe(403);
  });

  it("empleado recibe 403 al editar reorder_qty", async () => {
    tenantConMiembro("t-umbrales", "emp-1", "empleado");
    const plano = sesionDe("emp-1", "t-umbrales");
    await crearProducto("UMR-2");
    const r = (await patchProducts(patchSesion("http://x/api/products?sku=UMR-2", plano, { reorder_qty: 4 }))) as Response;
    expect(r.status).toBe(403);
  });

  it("dueno edita umbrales aunque el body forje rol empleado", async () => {
    tenantConMiembro("t-umbrales", "dueno-1", "dueno");
    const plano = sesionDe("dueno-1", "t-umbrales");
    await crearProducto("UMR-3");
    const rD = (await patchProducts(patchSesion("http://x/api/products?sku=UMR-3", plano, { rol: "empleado", min_stock: 3 }))) as Response;
    expect(rD.status).toBe(200);
    const rE = (await patchProducts(patchSesion("http://x/api/products?sku=UMR-3", plano, { reorder_qty: 7 }))) as Response;
    expect(rE.status).toBe(200);
    const j = (await rE.json()) as { min_stock: number | null; reorder_qty: number | null };
    expect(j).toMatchObject({ min_stock: 3, reorder_qty: 7 });
  });

  it("empleado sigue editando nombre sin umbrales", async () => {
    tenantConMiembro("t-umbrales", "emp-1", "empleado");
    const plano = sesionDe("emp-1", "t-umbrales");
    await crearProducto("UMR-4");
    const r = (await patchProducts(patchSesion("http://x/api/products?sku=UMR-4", plano, { nombre: "Nuevo nombre" }))) as Response;
    expect(r.status).toBe(200);
  });
});

describe("ALR-S1 el job usa min_stock antes que el fallback de rotación", () => {
  it("ejecutar_alertas_stock prefiere minimo sobre ventas7d", () => {
    limpiar_claves_alertas();
    const r = ejecutar_alertas_stock({
      tenantId: "t-alr-s1",
      fecha: "2026-10-16",
      modo: "matutino",
      catalogo: [
        { sku: "con-minimo", nombre: "Con mínimo", stock: 4, minimo: 10, ventas7d: 2, proveedor: null, reorderQty: 6 },
        { sku: "solo-rotacion", nombre: "Solo rotación", stock: 1, minimo: null, ventas7d: 2, proveedor: null },
        { sku: "sin-nada", nombre: "Sin nada", stock: 4, minimo: null, ventas7d: 0, proveedor: null },
      ],
      destinatarios: [{ googleSub: "d1", rol: "dueno", canales: ["email"] }],
      yaEnviados: new Set<string>(),
      enviarWa: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    });
    expect(r.alertas.map((a) => a.sku).sort()).toEqual(["con-minimo", "solo-rotacion"]);
    expect(r.alertas.find((a) => a.sku === "con-minimo")?.umbral).toBe(10);
    expect(r.alertas.find((a) => a.sku === "con-minimo")?.reorderQty).toBe(6);
  });

  it("endpoint matutino en memoria alerta con el min_stock del producto", async () => {
    modoSingleSinDb();
    resetStore();
    limpiar_claves_alertas();
    process.env.JOBS_SECRET = "secreto-alr-s1";
    control.tenants.set("t-alr-s1", {
      id: "t-alr-s1",
      nombreComercio: "Kiosco S1",
      slug: "kiosco-alr-s1",
      estado: "activo",
      plan: "basico",
      moneda: "ARS",
      ownerGoogleSub: "dueno-s1",
      esDemo: false,
    });
    control.botLinks.set("+5491100009101", { tenantId: "t-alr-s1", googleSub: "dueno-s1", estado: "verificado" });
    control.waPrefs.set("t-alr-s1:dueno-s1", { optIn: false, avisoHora: "08:00", pausadoHastaMs: null });
    try {
      await crearProducto("ALRS1-A", { min_stock: 10, reorder_qty: 6 });
      await crearProducto("ALRS1-B");
      store.stock.set("ALRS1-A", 4);
      store.stock.set("ALRS1-B", 4);
      const r = (await postAlertas(
        ctx("http://x/api/jobs/alertas-stock?fecha=2026-10-16", { headers: { "X-Job-Secret": "secreto-alr-s1" } }),
      )) as Response;
      expect(r.status).toBe(200);
      const j = (await r.json()) as { alertas: Array<{ sku: string; umbral: number; reorder_qty: number | null }> };
      const skus = j.alertas.map((a) => a.sku);
      expect(skus).toContain("ALRS1-A");
      expect(skus).not.toContain("ALRS1-B");
      expect(j.alertas.find((a) => a.sku === "ALRS1-A")?.umbral).toBe(10);
      expect(j.alertas.find((a) => a.sku === "ALRS1-A")?.reorder_qty).toBe(6);
    } finally {
      delete process.env.JOBS_SECRET;
      resetStore();
    }
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

const sufijoPG = `s1${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
const skuPGA = `S1A${sufijoPG}`.toUpperCase().slice(0, 32);
const skuPGB = `S1B${sufijoPG}`.toUpperCase().slice(0, 32);

describe.skipIf(!hayPG)("ALR-S1 PG A/B: min_stock y reorder_qty persisten y el job los usa", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(products).where(eq(products.sku, skuPGA));
      await db.delete(products).where(eq(products.sku, skuPGB));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("PATCH persiste en DB y GET lo lee", async () => {
    fijarMulti();
    tenantConMiembro("tenant-a", "dueno-a", "dueno");
    const plano = sesionDe("dueno-a", "tenant-a");
    const c = (await conTenant("tenant-a", () =>
      postProducts(post("http://x/api/products", { sku: skuPGA, nombre: "PG S1", precio_centavos: 500 })),
    )) as Response;
    expect(c.status).toBe(201);
    const p = (await conTenant("tenant-a", () =>
      patchProducts(patchSesion(`http://x/api/products?sku=${skuPGA}`, plano, { min_stock: 8, reorder_qty: 20 })),
    )) as Response;
    expect(p.status).toBe(200);
    const filas = await conTenant("tenant-a", async () =>
      getTenantDb().select({ minStock: products.minStock, reorderQty: products.reorderQty }).from(products).where(eq(products.sku, skuPGA)),
    );
    expect(filas[0]).toMatchObject({ minStock: 8, reorderQty: 20 });
    const g = (await conTenant("tenant-a", () => getProducts(ctx(`http://x/api/products?q=${skuPGA}`)))) as Response;
    const fichas = ((await g.json()) as { productos: Array<{ sku: string; min_stock: number | null; reorder_qty: number | null }> }).productos;
    expect(fichas.find((f) => f.sku === skuPGA)).toMatchObject({ min_stock: 8, reorder_qty: 20 });
  });

  it("empleado no edita umbrales en PG aunque forje rol dueno", async () => {
    fijarMulti();
    tenantConMiembro("tenant-a", "emp-a", "empleado");
    const plano = sesionDe("emp-a", "tenant-a");
    const p = (await conTenant("tenant-a", () =>
      patchProducts(patchSesion(`http://x/api/products?sku=${skuPGA}`, plano, { rol: "dueno", min_stock: 99 })),
    )) as Response;
    expect(p.status).toBe(403);
  });

  it("el job en PG alerta con min_stock de la DB", async () => {
    fijarMulti();
    limpiar_claves_alertas();
    process.env.JOBS_SECRET = "secreto-alr-s1-pg";
    control.tenants.set("tenant-a", {
      id: "tenant-a",
      nombreComercio: "Tenant A",
      slug: "tenant-a",
      estado: "activo",
      plan: "basico",
      moneda: "ARS",
      ownerGoogleSub: "dueno-a",
      esDemo: false,
    });
    control.botLinks.set("+5491100009201", { tenantId: "tenant-a", googleSub: "dueno-a", estado: "verificado" });
    control.waPrefs.set("tenant-a:dueno-a", { optIn: false, avisoHora: "08:00", pausadoHastaMs: null });
    tenantConMiembro("tenant-a", "dueno-a", "dueno");
    const planoPg = sesionDe("dueno-a", "tenant-a");
    try {
      const c = (await conTenant("tenant-a", () =>
        postProducts(post("http://x/api/products", { sku: skuPGB, nombre: "PG S1 B", precio_centavos: 500 })),
      )) as Response;
      expect(c.status).toBe(201);
      const p = (await conTenant("tenant-a", () =>
        patchProducts(patchSesion(`http://x/api/products?sku=${skuPGB}`, planoPg, { min_stock: 9, reorder_qty: 3 })),
      )) as Response;
      expect(p.status).toBe(200);
      const r = (await postAlertas(
        ctx("http://x/api/jobs/alertas-stock?fecha=2026-10-16", {
          headers: { "X-Job-Secret": "secreto-alr-s1-pg", "X-Tenant-Id": "tenant-a" },
        }),
      )) as Response;
      expect(r.status).toBe(200);
      const j = (await r.json()) as { alertas: Array<{ sku: string; umbral: number; reorder_qty: number | null }> };
      const item = j.alertas.find((a) => a.sku === skuPGB);
      expect(item?.umbral).toBe(9);
      expect(item?.reorder_qty).toBe(3);
    } finally {
      delete process.env.JOBS_SECRET;
    }
  });
});
