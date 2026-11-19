import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products } from "../src/db/schema.js";
import { tenantProductSeeds } from "../src/db/schema-planes.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import {
  PLANTILLAS_PRODUCTOS_RUBRO,
  VERSION_PLANTILLAS_PRODUCTOS_RUBRO,
  plantilla_productos_rubro,
  skuPlantilla,
} from "../src/modules/onboarding/plantillas-productos-rubro.js";
import {
  leerSiembraProductos,
  registrarSiembraProductos,
  sembrarProductosRubro,
} from "../src/lib/repos/siembra-productos.js";
import { GET as getPlantilla, POST as postPlantilla } from "../src/pages/api/stock/plantilla.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const AHORA = new Date("2026-10-20T12:00:00.000Z");

// P10-20: la sesión del fixture vence a los 30 días de AHORA; con el reloj
// real el test se rompía solo al día 30. Fijar solo Date deja vivos los timers.
beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

const KIOSCO = [
  "Agua mineral 500 ml",
  "Gaseosa cola 500 ml",
  "Gaseosa lima-limón 500 ml",
  "Jugo en caja 200 ml",
  "Bebida energizante 473 ml",
  "Alfajor simple",
  "Alfajor triple",
  "Chocolate en barra",
  "Caramelos surtidos",
  "Chicles",
  "Galletitas dulces",
  "Galletitas saladas",
  "Papas fritas 80 g",
  "Cigarrillos (atado de 20)",
  "Encendedor",
  "Pañuelitos descartables",
  "Pilas AA",
];

const ALMACEN = [
  "Yerba mate 1 kg",
  "Azúcar 1 kg",
  "Harina 000 1 kg",
  "Arroz 1 kg",
  "Fideos secos 500 g",
  "Aceite de girasol 1,5 l",
  "Leche 1 l",
  "Huevos (docena)",
  "Pan lactal",
  "Puré de tomate 520 g",
  "Sal fina 500 g",
  "Café molido 250 g",
  "Té en saquitos (caja de 25)",
  "Galletitas de agua",
  "Lavandina 1 l",
  "Detergente 750 ml",
  "Papel higiénico (4 rollos)",
  "Jabón de tocador",
];

const DESPENSA = [
  "Yerba mate 1 kg",
  "Azúcar 1 kg",
  "Harina 000 1 kg",
  "Arroz 1 kg",
  "Fideos secos 500 g",
  "Polenta 500 g",
  "Lentejas 400 g",
  "Aceite de girasol 1,5 l",
  "Atún en lata",
  "Puré de tomate 520 g",
  "Mermelada 454 g",
  "Dulce de leche 400 g",
  "Leche 1 l",
  "Manteca 200 g",
  "Queso cremoso (kg)",
  "Fiambre (kg)",
  "Galletitas de agua",
];

const LIBRERIA = [
  "Cuaderno tapa dura 48 hojas",
  "Cuaderno espiral A4",
  "Repuesto de hojas rayadas",
  "Lapicera azul",
  "Lapicera negra",
  "Lápiz negro HB",
  "Goma de borrar",
  "Sacapuntas",
  "Regla 30 cm",
  "Plasticola 90 g",
  "Tijera escolar",
  "Resaltador",
  "Carpeta N° 3",
  "Folios (paquete de 10)",
  "Cinta adhesiva",
  "Fotocopia simple",
];

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function sesion(sub: string, tenantId: string | null): string {
  const c = crearSesion({ googleSub: sub, tenantId, ahora: AHORA });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: AHORA.toISOString(),
  });
  return c.idPlano;
}

function comercio(rol: "dueno" | "empleado" = "dueno", sub = "g-1", rubro = "kiosco") {
  control.tenants.set("t-1", {
    id: "t-1",
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "g-1",
    esDemo: false,
    rubro,
  });
  control.memberships.set(`m-${sub}`, {
    id: `m-${sub}`,
    tenantId: "t-1",
    googleSub: sub,
    rol,
    permisos: [],
    estado: "activo",
  });
}

function pedirPlantilla(plano?: string) {
  return getPlantilla(
    ctx("http://x/api/stock/plantilla", plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
  );
}

function enviarPlantilla(body: Record<string, unknown>, plano?: string) {
  return postPlantilla(
    ctx("http://x/api/stock/plantilla", {
      body,
      ...(plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
    }),
  );
}

describe("STOCK-S6 plantilla de productos por rubro", () => {
  it("espeja las listas exactas de cada rubro y deja otro vacío", () => {
    expect(VERSION_PLANTILLAS_PRODUCTOS_RUBRO).toBe("v1");
    expect(Object.keys(PLANTILLAS_PRODUCTOS_RUBRO).sort()).toEqual([
      "almacen",
      "despensa",
      "kiosco",
      "libreria",
      "otro",
    ]);
    expect(plantilla_productos_rubro("kiosco").productos).toEqual(KIOSCO);
    expect(plantilla_productos_rubro("almacen").productos).toEqual(ALMACEN);
    expect(plantilla_productos_rubro("despensa").productos).toEqual(DESPENSA);
    expect(plantilla_productos_rubro("libreria").productos).toEqual(LIBRERIA);
    expect(plantilla_productos_rubro("otro").productos).toEqual([]);
    expect(plantilla_productos_rubro("sin-plantilla").productos).toEqual([]);
  });

  it("no trae precios y no repite nombres dentro de un rubro", () => {
    for (const rubro of ["kiosco", "almacen", "despensa", "libreria"]) {
      const productos = plantilla_productos_rubro(rubro).productos;
      expect(new Set(productos).size, rubro).toBe(productos.length);
      for (const nombre of productos) {
        expect(nombre, rubro).not.toMatch(/\$|precio|centavos/i);
      }
    }
  });

  it("skuPlantilla es determinístico, ascii, en mayúsculas y de hasta 40 caracteres", () => {
    expect(skuPlantilla("Yerba mate 1 kg")).toBe("PLT-YERBA-MATE-1-KG");
    expect(skuPlantilla("Azúcar 1 kg")).toBe("PLT-AZUCAR-1-KG");
    expect(skuPlantilla("Gaseosa lima-limón 500 ml")).toBe("PLT-GASEOSA-LIMA-LIMON-500-ML");
    expect(skuPlantilla("Gaseosa lima-limón 500 ml")).toBe(skuPlantilla("Gaseosa lima-limón 500 ml"));
    const largo = skuPlantilla("Producto con un nombre extremadamente largo para probar el tope de cuarenta");
    expect(largo.startsWith("PLT-")).toBe(true);
    expect(largo.slice(4).length).toBeLessThanOrEqual(40);
    expect(largo.endsWith("-")).toBe(false);
  });
});

describe("STOCK-S8/S9 repo en memoria", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("crea solo los elegidos sin precio y con origen plantilla_rubro", async () => {
    const r = await sembrarProductosRubro("t-1", "kiosco", ["Agua mineral 500 ml", "Alfajor simple"]);

    expect(r).toEqual({ ok: true, cantidad: 2 });
    expect([...store.productos.keys()].sort()).toEqual(["PLT-AGUA-MINERAL-500-ML", "PLT-ALFAJOR-SIMPLE"]);
    expect(store.productos.get("PLT-AGUA-MINERAL-500-ML")).toMatchObject({
      nombre: "Agua mineral 500 ml",
      precioCentavos: 0,
      origen: "plantilla_rubro",
    });
    expect(store.stock.get("PLT-AGUA-MINERAL-500-ML")).toBe(0);
    expect(store.prices.get("PLT-AGUA-MINERAL-500-ML")).toBe(0);
    expect(await leerSiembraProductos("t-1")).toBe(true);
  });

  it("no vuelve a sembrar y responde YA_SEMBRADO", async () => {
    expect((await sembrarProductosRubro("t-1", "kiosco", ["Agua mineral 500 ml"])).ok).toBe(true);
    expect(await sembrarProductosRubro("t-1", "kiosco", ["Alfajor simple"])).toEqual({
      ok: false,
      codigo: "YA_SEMBRADO",
    });
    expect(store.productos.has("PLT-ALFAJOR-SIMPLE")).toBe(false);
  });

  it("rechaza un nombre fuera de la plantilla sin crear ni registrar nada", async () => {
    expect(await sembrarProductosRubro("t-1", "kiosco", ["Agua mineral 500 ml", "Producto inventado"])).toEqual({
      ok: false,
      codigo: "NOMBRE_FUERA_DE_PLANTILLA",
    });
    expect(store.productos.size).toBe(0);
    expect(await leerSiembraProductos("t-1")).toBe(false);
  });

  it("una lista vacía registra la siembra con cantidad 0 y no vuelve a ofrecer", async () => {
    expect(await sembrarProductosRubro("t-1", "otro", [])).toEqual({ ok: true, cantidad: 0 });
    expect(await leerSiembraProductos("t-1")).toBe(true);
    expect(store.productos.size).toBe(0);
    expect(await sembrarProductosRubro("t-1", "otro", [])).toEqual({ ok: false, codigo: "YA_SEMBRADO" });
  });

  it("registrarSiembraProductos es idempotente y leerSiembraProductos la recuerda", async () => {
    expect(await leerSiembraProductos("t-1")).toBe(false);
    await registrarSiembraProductos("t-1", { rubro: "kiosco", version: "v1", cantidad: 3 });
    expect(await leerSiembraProductos("t-1")).toBe(true);
    expect(await leerSiembraProductos("t-2")).toBe(false);
  });
});

describe("STOCK-S7/S8 GET y POST /api/stock/plantilla", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("sin sesión responde 403", async () => {
    expect((await pedirPlantilla()).status).toBe(403);
    expect((await enviarPlantilla({ nombres: [] })).status).toBe(403);
  });

  it("un empleado no puede ver ni sembrar el catálogo", async () => {
    comercio("empleado", "g-2");
    const plano = sesion("g-2", "t-1");

    expect((await pedirPlantilla(plano)).status).toBe(403);
    expect((await enviarPlantilla({ nombres: ["Agua mineral 500 ml"] }, plano)).status).toBe(403);
  });

  it("el Dueño ve el rubro, la versión y las sugerencias sin sembrar", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");

    const r = await pedirPlantilla(plano);

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      rubro: "kiosco",
      version: "v1",
      productos: KIOSCO,
      sembrado: false,
    });
  });

  it("el Dueño crea los seleccionados y deja de verlos", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");

    const post = await enviarPlantilla({ nombres: ["Agua mineral 500 ml", "Pilas AA"] }, plano);
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ ok: true, cantidad: 2 });

    const get = (await (await pedirPlantilla(plano)).json()) as { sembrado: boolean };
    expect(get.sembrado).toBe(true);
    expect(store.productos.has("PLT-AGUA-MINERAL-500-ML")).toBe(true);
    expect(store.productos.has("PLT-PILAS-AA")).toBe(true);
  });

  it("un nombre fuera de la plantilla responde 422 y una segunda siembra 409", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");

    expect((await enviarPlantilla({ nombres: ["Producto inventado"] }, plano)).status).toBe(422);
    expect((await enviarPlantilla({ nombres: ["Agua mineral 500 ml"] }, plano)).status).toBe(200);
    expect((await enviarPlantilla({ nombres: ["Agua mineral 500 ml"] }, plano)).status).toBe(409);
  });

  it("un cuerpo inválido responde 422", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");

    expect((await enviarPlantilla({ nombres: "Agua mineral 500 ml" }, plano)).status).toBe(422);
    expect((await enviarPlantilla({ nombres: [""] }, plano)).status).toBe(422);
    expect((await enviarPlantilla({ nombres: Array.from({ length: 101 }, () => "Agua mineral 500 ml") }, plano)).status).toBe(422);
  });

  it("con rubro otro no muestra sugerencias y permite descartarlas", async () => {
    comercio("dueno", "g-1", "otro");
    const plano = sesion("g-1", "t-1");

    const get = await pedirPlantilla(plano);
    expect(await get.json()).toEqual({ rubro: "otro", version: "v1", productos: [], sembrado: false });

    expect((await enviarPlantilla({ nombres: [] }, plano)).status).toBe(200);
    const despues = (await (await pedirPlantilla(plano)).json()) as { sembrado: boolean };
    expect(despues.sembrado).toBe(true);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
const skuAgua = "PLT-AGUA-MINERAL-500-ML";
const skuAlfajor = "PLT-ALFAJOR-SIMPLE";
const skusPrueba = [skuAgua, skuAlfajor];

describe.skipIf(!hayPG)("STOCK-S8/S9 multi con PG: seeds y productos", () => {
  let basePriv = "";

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  async function limpiar() {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(products).where(inArray(products.sku, skusPrueba));
      await db.delete(tenantProductSeeds).where(eq(tenantProductSeeds.tenantId, "tenant-a"));
    });
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("stock_e2_plantilla_a", process.env.PG_TEST_URL_A ?? "");
    await limpiar();
    resetStore();
  });

  afterAll(async () => {
    if (!basePriv) return;
    await limpiar();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  it("crea los productos sin precio y registra una fila de seed con la cantidad", async () => {
    fijarMulti();

    const r = await conTenant("tenant-a", () =>
      sembrarProductosRubro("tenant-a", "kiosco", ["Agua mineral 500 ml", "Alfajor simple"]),
    );
    expect(r).toEqual({ ok: true, cantidad: 2 });

    const estado = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const prods = await db.select().from(products).where(inArray(products.sku, skusPrueba));
      const seeds = await db.select().from(tenantProductSeeds).where(eq(tenantProductSeeds.tenantId, "tenant-a"));
      return { prods, seeds };
    });

    expect(estado.prods).toHaveLength(2);
    for (const p of estado.prods) {
      expect(p.precioCentavos).toBe(0n);
      expect(p.stockActual).toBe(0);
      expect(p.origen).toBe("plantilla_rubro");
    }
    expect(estado.seeds).toHaveLength(1);
    expect(estado.seeds[0]).toMatchObject({ rubro: "kiosco", plantillaVersion: "v1", cantidad: 2 });
  });

  it("sobrevive un reinicio y no vuelve a sembrar", async () => {
    fijarMulti();
    resetStore();

    expect(await conTenant("tenant-a", () => leerSiembraProductos("tenant-a"))).toBe(true);
    expect(
      await conTenant("tenant-a", () => sembrarProductosRubro("tenant-a", "kiosco", ["Agua mineral 500 ml"])),
    ).toEqual({ ok: false, codigo: "YA_SEMBRADO" });
  });

  it("una lista vacía registra cantidad 0 en la base", async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      await getTenantDb().delete(tenantProductSeeds).where(eq(tenantProductSeeds.tenantId, "tenant-a"));
    });
    resetStore();

    const r = await conTenant("tenant-a", () => sembrarProductosRubro("tenant-a", "otro", []));
    expect(r).toEqual({ ok: true, cantidad: 0 });

    const seeds = await conTenant("tenant-a", () =>
      getTenantDb().select().from(tenantProductSeeds).where(eq(tenantProductSeeds.tenantId, "tenant-a")),
    );
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ rubro: "otro", cantidad: 0 });
  });
});
