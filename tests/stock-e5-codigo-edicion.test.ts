import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, productCodes } from "../src/db/schema.js";
import { POST as postProducts, PATCH as patchProducts } from "../src/pages/api/products.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";

// STOCK-E5: edición de códigos de un producto existente vía PATCH
// /api/products. El alta ya cubre stock-s19; acá se cubre asignar (con
// normalización), duplicado con 409 y limpiar con cadena vacía.

function tenantConMiembro(tenantId: string, sub: string, rol: "dueno" | "empleado") {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco E5",
    slug: "kiosco-e5",
    estado: "activo",
    plan: "basico",
    moneda: "ARS",
    ownerGoogleSub: "dueno-e5",
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

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

function post(url: string, body: unknown, plano?: string) {
  return ctx(url, {
    method: "POST",
    body: body as Record<string, unknown>,
    ...(plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
  });
}

function patch(url: string, body: unknown, plano?: string) {
  return ctx(url, {
    method: "PATCH",
    body: body as Record<string, unknown>,
    ...(plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
  });
}

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijo = `e5${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`
  .replace(/[^a-z0-9]/g, "")
  .slice(0, 10);
const skuDe = (letra: string) => `E5${letra}${sufijo}`.toUpperCase().slice(0, 32);
const codDe = (letra: string) => `C5${letra}${sufijo}`.toUpperCase();

describe("STOCK-E5 PATCH codigo en modo memoria", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
    resetStore();
  });

  it("asigna el codigo normalizado al almacén", async () => {
    const sku = skuDe("M1");
    const cod = codDe("m1");
    const c = (await postProducts(post("http://x/api/products", { sku, nombre: "Memoria E5", precio_centavos: 100 }))) as Response;
    expect(c.status).toBe(201);
    const p = (await patchProducts(patch(`http://x/api/products?sku=${sku}`, { codigo: cod.toLowerCase() }))) as Response;
    expect(p.status).toBe(200);
    expect(store.codigos.get(cod)).toBe(sku);
  });

  it("codigo tomado por otro producto da 409", async () => {
    const skuA = skuDe("M2");
    const skuB = skuDe("M3");
    const cod = codDe("m2");
    const a = (await postProducts(
      post("http://x/api/products", { sku: skuA, nombre: "Tiene codigo", precio_centavos: 100, codigo: cod }),
    )) as Response;
    expect(a.status).toBe(201);
    const b = (await postProducts(post("http://x/api/products", { sku: skuB, nombre: "Quiere codigo", precio_centavos: 100 }))) as Response;
    expect(b.status).toBe(201);
    const p = (await patchProducts(patch(`http://x/api/products?sku=${skuB}`, { codigo: cod }))) as Response;
    expect(p.status).toBe(409);
    const j = (await p.json()) as { error: string };
    expect(j.error).toBe("codigo duplicado");
    expect(store.codigos.get(cod)).toBe(skuA);
  });

  it("reasignar el mismo codigo al mismo producto no es duplicado", async () => {
    const sku = skuDe("M4");
    const cod = codDe("m4");
    const c = (await postProducts(
      post("http://x/api/products", { sku, nombre: "Propio", precio_centavos: 100, codigo: cod }),
    )) as Response;
    expect(c.status).toBe(201);
    const p = (await patchProducts(patch(`http://x/api/products?sku=${sku}`, { codigo: cod }))) as Response;
    expect(p.status).toBe(200);
  });
});

describe.skipIf(!hayPG)("STOCK-E5 multi PG: PATCH edita product_codes", () => {
  let plano = "";

  beforeEach(() => {
    resetStore();
    fijarMulti();
    tenantConMiembro("tenant-a", "dueno-e5", "dueno");
    plano = sesionDe("dueno-e5", "tenant-a");
  });

  afterAll(async () => {
    fijarMulti();
    const skus = [skuDe("P1"), skuDe("P2"), skuDe("P3"), skuDe("P4")];
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(productCodes).where(inArray(productCodes.sku, skus));
      await db.delete(products).where(inArray(products.sku, skus));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  async function crear(sku: string, extra: Record<string, unknown> = {}) {
    const c = (await conTenant("tenant-a", () =>
      postProducts(post("http://x/api/products", { sku, nombre: `Prod ${sku}`, precio_centavos: 100, ...extra }, plano)),
    )) as Response;
    expect(c.status).toBe(201);
  }

  async function patchear(sku: string, body: Record<string, unknown>) {
    return (await conTenant("tenant-a", () =>
      patchProducts(patch(`http://x/api/products?sku=${sku}`, body, plano)),
    )) as Response;
  }

  async function codigosDe(sku: string) {
    return conTenant("tenant-a", async () =>
      getTenantDb().select({ codigo: productCodes.codigo }).from(productCodes).where(eq(productCodes.sku, sku)),
    );
  }

  it("asigna un codigo nuevo a un producto existente", async () => {
    const sku = skuDe("P1");
    const cod = codDe("p1");
    await crear(sku);
    const p = await patchear(sku, { codigo: cod.toLowerCase() });
    expect(p.status).toBe(200);
    expect(await codigosDe(sku)).toEqual([{ codigo: cod }]);
  });

  it("codigo ya usado por otro producto da 409 y no escribe", async () => {
    const skuA = skuDe("P2");
    const skuB = skuDe("P3");
    const cod = codDe("p2");
    await crear(skuA, { codigo: cod });
    await crear(skuB);
    const p = await patchear(skuB, { codigo: cod });
    expect(p.status).toBe(409);
    const j = (await p.json()) as { error: string };
    expect(j.error).toBe("codigo duplicado");
    expect(await codigosDe(skuA)).toEqual([{ codigo: cod }]);
    expect(await codigosDe(skuB)).toEqual([]);
  });

  it("cadena vacia limpia el codigo", async () => {
    const sku = skuDe("P4");
    const cod = codDe("p4");
    await crear(sku, { codigo: cod });
    expect(await codigosDe(sku)).toEqual([{ codigo: cod }]);
    const p = await patchear(sku, { codigo: "" });
    expect(p.status).toBe(200);
    expect(await codigosDe(sku)).toEqual([]);
  });
});
