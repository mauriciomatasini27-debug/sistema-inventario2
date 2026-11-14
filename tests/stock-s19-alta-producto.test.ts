import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { control, resetStore } from "../src/lib/store.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, productCodes } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { POST as postProducts } from "../src/pages/api/products.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import {
  armarAltaProducto,
  generarSkuInterno,
  mensajeErrorAlta,
  accionSiCodigoDuplicado,
} from "../src/modules/stock/alta-producto-panel.js";

function tenantConMiembro(tenantId: string, sub: string, rol: "dueno" | "empleado", permisos: string[] = []) {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco S19",
    slug: "kiosco-s19",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueno-1",
    esDemo: false,
  });
  const mid = `m-${tenantId}-${sub}`;
  control.memberships.set(mid, { id: mid, tenantId, googleSub: sub, rol, permisos, estado: "activo" });
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

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

describe("STOCK-S19 alta producto panel", () => {
  it("genera SKU interno único sin código", () => {
    const a = generarSkuInterno("entropia-aaa");
    const b = generarSkuInterno("entropia-bbb");
    expect(a).toMatch(/^INT-[A-Z0-9]{8,12}$/);
    expect(a).not.toBe(b);
    const cuerpo = armarAltaProducto({
      nombre: "Yerba",
      precioCentavos: 0,
      entropiaSku: "test-entropia-1",
    });
    expect(cuerpo.sku).toMatch(/^INT-/);
    expect(cuerpo.nombre).toBe("Yerba");
    expect(cuerpo.codigo).toBeUndefined();
  });

  it("usa el código como SKU cuando hay barras", () => {
    const cuerpo = armarAltaProducto({
      nombre: "Gaseosa",
      codigo: "7790123456789",
      precioCentavos: 500,
      entropiaSku: "x",
    });
    expect(cuerpo.sku).toBe("7790123456789");
    expect(cuerpo.codigo).toBe("7790123456789");
  });

  it("mensajes de error en castellano y acción por duplicado", () => {
    expect(mensajeErrorAlta(403, "")).toContain("permiso");
    expect(mensajeErrorAlta(409, "codigo duplicado")).toContain("comercio");
    const abrir = accionSiCodigoDuplicado(409, "codigo duplicado", [{ sku: "SKU-1" }]);
    expect(abrir).toEqual({ tipo: "abrir", sku: "SKU-1", mensaje: expect.any(String) });
  });

  it("stock panel expone el formulario solo con permiso", () => {
    const src = readFileSync("src/pages/panel/stock.astro", "utf8");
    expect(src).toContain('id="alta-producto-card"');
    expect(src).toContain("Agregar producto");
    expect(src).toContain("Crear producto con este código");
    expect(src).toContain("{puedeCrear ?");
  });
});

describe("STOCK-S19 POST /api/products permiso y aislamiento", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
  });

  it("empleado sin crear_productos recibe 403", async () => {
    tenantConMiembro("t-s19", "emp-s19", "empleado");
    const plano = sesionDe("emp-s19", "t-s19");
    const r = (await postProducts(
      ctx("http://x/api/products", {
        headers: { cookie: `__Host-sesion=${plano}` },
        body: { sku: "S19-NO", nombre: "No", precio_centavos: 100 },
      }),
    )) as Response;
    expect(r.status).toBe(403);
  });

  it("alta sin código en memoria y duplicado en el mismo comercio", async () => {
    const sku = generarSkuInterno("mem-1");
    const ok = (await postProducts(
      ctx("http://x/api/products", {
        body: { sku, nombre: "Primero", precio_centavos: 0, codigo: "COD-S19-A" },
      }),
    )) as Response;
    expect(ok.status).toBe(201);
    const dup = (await postProducts(
      ctx("http://x/api/products", {
        body: { sku: "OTRO-SKU", nombre: "Dup", precio_centavos: 0, codigo: "COD-S19-A" },
      }),
    )) as Response;
    expect(dup.status).toBe(409);
    const j = (await dup.json()) as { error: string };
    expect(j.error).toBe("codigo duplicado");
  });
});

describe.skipIf(!hayPG)("STOCK-S19 multi PG: aislamiento entre comercios", () => {
  const sufijo = `${Date.now().toString(36)}`.toUpperCase();
  const skuCompartido = `S19-${sufijo}`.slice(0, 20);
  const codigoCompartido = `C19-${sufijo}`.slice(0, 20);

  beforeEach(() => {
    resetStore();
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
    process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
  });

  afterAll(async () => {
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(productCodes).where(eq(productCodes.codigo, codigoCompartido));
      await db.delete(products).where(eq(products.sku, skuCompartido));
    });
    delete process.env.TENANT_MODE;
  });

  it("mismo SKU en tenant B no filtra datos de tenant A", async () => {
    await conTenant("tenant-a", () =>
      postProducts(
        ctx("http://x/api/products", {
          body: { sku: skuCompartido, nombre: "Solo A", precio_centavos: 100, codigo: codigoCompartido },
        }),
      ),
    );
    const rB = (await conTenant("tenant-b", () =>
      postProducts(
        ctx("http://x/api/products", {
          body: { sku: skuCompartido, nombre: "Intento B", precio_centavos: 200 },
        }),
      ),
    )) as Response;
    expect([201, 409]).toContain(rB.status);
    if (rB.status === 409) {
      const j = (await rB.json()) as { error: string; nombre?: string };
      expect(j.error).toBe("sku duplicado");
      expect(j.nombre).toBeUndefined();
    }
    const listaB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select({ nombre: products.nombre }).from(products).where(eq(products.sku, skuCompartido));
    });
    expect(listaB.every((f) => f.nombre !== "Solo A")).toBe(true);
  });
});