import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { productCodes, products } from "../src/db/schema.js";
import { GET as GETProducts, POST as POSTProducts } from "../src/pages/api/products.js";

function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

beforeEach(() => {
  modoSingleSinDb();
  resetStore();
});

async function postAlta(body: Record<string, unknown>): Promise<Response> {
  return (await POSTProducts(ctx("http://x/api/products", { body }))) as Response;
}

describe("P3-1 CAT-S2 alta corta precargada + pendiente revision", () => {
  it("codigo inexistente ofrece alta_corta; alta dueno/empleado define estado", async () => {
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

    const altaPend = await postAlta({ sku: "ALTA-2", nombre: "Pend", precio_centavos: 100, codigo: "779998", rol: "empleado", permisos: [] });
    expect(altaPend.status).toBe(201);
    expect(((await altaPend.json()) as { estado: string }).estado).toBe("pendiente_revision");

    const altaPermiso = await postAlta({ sku: "ALTA-3", nombre: "Perm", precio_centavos: 100, codigo: "779997", rol: "empleado", permisos: ["crear_productos"] });
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

describe.skipIf(!hayPG)("P3-1 CAT-S2 multi con PG local: estado pendiente_revision al leer por codigo", () => {
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

  it("alta de empleado sin permiso queda pendiente_revision tambien leida desde la DB", async () => {
    fijarMulti();
    const alta = (await conTenant("tenant-a", () =>
      POSTProducts(ctx("http://x/api/products", { body: { sku: skuPG, nombre: "Pend DB", precio_centavos: 100, codigo: codPG, rol: "empleado" } })),
    )) as Response;
    expect(alta.status).toBe(201);
    expect(((await alta.json()) as { estado: string }).estado).toBe("pendiente_revision");
    const leido = (await conTenant("tenant-a", () => GETProducts(ctx(`http://x/api/products?codigo=${codPG}`)))) as Response;
    const j = (await leido.json()) as { productos: Array<{ sku: string; estado: string }>; fuente?: string; alta_corta?: unknown };
    expect(j.fuente).toBe("db");
    expect(j.productos.map((p) => [p.sku, p.estado])).toEqual([[skuPG, "pendiente_revision"]]);
    expect(j.alta_corta).toBeUndefined();
  });
});
