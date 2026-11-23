import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { modoSingleSinDb, reiniciarAltaCatalogo, sesionDe, tenantConMiembro } from "./helpers/alta-catalogo.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { productCodes, products } from "../src/db/schema.js";
import { GET as GETProducts, POST as POSTProducts } from "../src/pages/api/products.js";

function conSesion(url: string, plano: string, body: Record<string, unknown>) {
  return ctx(url, { body, headers: { cookie: `__Host-sesion=${plano}` } });
}

beforeEach(() => {
  reiniciarAltaCatalogo();
});

async function postAlta(body: Record<string, unknown>): Promise<Response> {
  return (await POSTProducts(ctx("http://x/api/products", { body }))) as Response;
}

describe("P3-1 CAT-S2 alta corta precargada y Alta de catálogo", () => {
  it("codigo inexistente ofrece alta_corta; el alta de dueño y empleado queda activa", async () => {
    const noExiste = (await GETProducts(ctx("http://x/api/products?codigo=NOEXISTE"))) as Response;
    expect(noExiste.status).toBe(200);
    const jNoExiste = (await noExiste.json()) as { productos: unknown[]; alta_corta?: { codigo: string } };
    expect(jNoExiste.productos).toEqual([]);
    expect(jNoExiste.alta_corta?.codigo).toBe("NOEXISTE");

    const vacio = (await GETProducts(ctx("http://x/api/products?codigo=%20%20"))) as Response;
    const jVacio = (await vacio.json()) as { productos: unknown[]; alta_corta?: { codigo: string } };
    expect(Array.isArray(jVacio.productos)).toBe(true);
    expect(jVacio.alta_corta).toBeUndefined();

    const altaDueno = await postAlta({ sku: "ALTA-1", nombre: "Alta", precio_centavos: 100, codigo: "779999" });
    expect(altaDueno.status).toBe(201);
    expect(((await altaDueno.json()) as { estado: string }).estado).toBe("activo");

    // P9-13: el body `rol` se ignora; manda la membership de la sesión.
    // spec 433 T1: el alta ya no pide crear_productos; el body forjado tampoco.
    tenantConMiembro("t-alta", "emp-1", "empleado", ["registrar_devoluciones"]);
    const planoEmp = sesionDe("emp-1", "t-alta");
    const altaEmp = (await POSTProducts(conSesion("http://x/api/products", planoEmp, { sku: "ALTA-2", nombre: "Alta empleado", precio_centavos: 100, codigo: "779998", rol: "dueno", permisos: ["crear_productos"] }))) as Response;
    expect(altaEmp.status).toBe(201);
    expect(((await altaEmp.json()) as { estado: string; nombre: string }).estado).toBe("activo");

    tenantConMiembro("t-alta", "emp-2", "empleado", ["crear_productos"]);
    const planoPermiso = sesionDe("emp-2", "t-alta");
    const altaPermiso = (await POSTProducts(conSesion("http://x/api/products", planoPermiso, { sku: "ALTA-3", nombre: "Perm", precio_centavos: 100, codigo: "779997", rol: "empleado" }))) as Response;
    expect(altaPermiso.status).toBe(201);
    expect(((await altaPermiso.json()) as { estado: string }).estado).toBe("activo");

    const encontrado = (await GETProducts(ctx("http://x/api/products?codigo=779999"))) as Response;
    const jEncontrado = (await encontrado.json()) as { productos: unknown[]; alta_corta?: { codigo: string } };
    expect(jEncontrado.productos.length).toBe(1);
    expect(jEncontrado.alta_corta).toBeUndefined();

    const duplicado = await postAlta({ sku: "OTRA-9", nombre: "Otra", precio_centavos: 100, codigo: "779999" });
    expect(duplicado.status).toBe(409);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.toUpperCase();

function fijarMulti(): void {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("spec 433 T1: alta de empleado con PG local y aislamiento", () => {
  const skuPG = `S2-${sufijoPG}`.slice(0, 32);
  const codPG = `S2C-${sufijoPG}`.slice(0, 32);

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(productCodes).where(eq(productCodes.sku, skuPG));
      await db.delete(products).where(eq(products.sku, skuPG));
    });
    modoSingleSinDb();
  });

  it("empleado sin crear_productos persiste el alta en su comercio, sin stock ni origen provisorio", async () => {
    fijarMulti();
    tenantConMiembro("tenant-a", "emp-s2", "empleado", ["registrar_devoluciones"]);
    const plano = sesionDe("emp-s2", "tenant-a");
    const alta = (await conTenant("tenant-a", () =>
      POSTProducts(conSesion("http://x/api/products", plano, { sku: skuPG, nombre: "Alta DB", precio_centavos: 100, codigo: codPG, rol: "dueno", permisos: ["crear_productos"] })),
    )) as Response;
    expect(alta.status).toBe(201);
    expect(((await alta.json()) as { estado: string }).estado).toBe("activo");

    const filas = await conTenant("tenant-a", () =>
      getTenantDb()
        .select({ nombre: products.nombre, stock: products.stockActual, origen: products.origen, tenantId: products.tenantId })
        .from(products)
        .where(eq(products.sku, skuPG)),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ nombre: "Alta DB", stock: 0 });
    expect(filas[0]?.origen).not.toBe("alta_al_vender");
    expect(filas[0]?.tenantId).toBeTruthy();

    const filasB = await conTenant("tenant-b", () =>
      getTenantDb().select({ sku: products.sku }).from(products).where(eq(products.sku, skuPG)),
    );
    expect(filasB).toEqual([]);

    const leido = (await conTenant("tenant-a", () => GETProducts(ctx(`http://x/api/products?codigo=${codPG}`)))) as Response;
    const j = (await leido.json()) as { productos: unknown[] };
    expect(j.productos.length).toBe(1);
  });

  it("sesión de otro comercio no puede dar de alta aquí", async () => {
    fijarMulti();
    tenantConMiembro("tenant-b", "emp-b", "empleado");
    const planoB = sesionDe("emp-b", "tenant-b");
    const intento = (await conTenant("tenant-a", () =>
      POSTProducts(conSesion("http://x/api/products", planoB, { sku: `${skuPG}-B`, nombre: "Ajeno", precio_centavos: 100 })),
    )) as Response;
    expect(intento.status).toBe(403);
  });
});
