import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products } from "../src/db/schema.js";
import { agregarLineaTicket } from "../src/lib/ticket-memoria.js";
import { GET as getProducts, PATCH as patchProducts, POST as postProducts } from "../src/pages/api/products.js";
import { GET as getPull } from "../src/pages/api/sync/pull.js";
import { etiquetaPrecioCatalogo } from "../src/lib/catalogo-panel.js";
import { armarAltaProducto, avisoPorPeso } from "../src/modules/stock/alta-producto-panel.js";
import {
  descargarCatalogo,
  esPorPesoLocal,
  leerCatalogoLocal,
  type RespuestaCatalogo,
  type StorageCatalogo,
} from "../src/offline/catalogo-local.js";

function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function storageMemoria(): StorageCatalogo & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  return {
    mapa,
    getItem: (clave) => mapa.get(clave) ?? null,
    setItem: (clave, valor) => void mapa.set(clave, valor),
    removeItem: (clave) => void mapa.delete(clave),
    keys: () => [...mapa.keys()],
  };
}

function respuesta(cuerpo: unknown): RespuestaCatalogo {
  return { ok: true, status: 200, json: async () => cuerpo };
}

interface FichaHttp {
  sku: string;
  por_peso: boolean;
  precio_centavos?: number | string;
}

describe("T1 #385 API de productos: flag por_peso", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("alta sin flag queda apagada y la GET lo expone igual", async () => {
    const alta = (await postProducts(
      ctx("http://x/api/products", { body: { sku: "VP-UNI", nombre: "Manzanas", precio_centavos: 1200 } }),
    )) as Response;
    expect(alta.status).toBe(201);
    expect(((await alta.json()) as FichaHttp).por_peso).toBe(false);

    const lista = (await getProducts(ctx("http://x/api/products?q=VP-UNI"))) as Response;
    const fichas = ((await lista.json()) as { productos: FichaHttp[] }).productos;
    expect(fichas.find((f) => f.sku === "VP-UNI")?.por_peso).toBe(false);
  });

  it("alta con por_peso enciende el flag y el precio se interpreta por kilogramo", async () => {
    const alta = (await postProducts(
      ctx("http://x/api/products", {
        body: { sku: "VP-PESO", nombre: "Papas", precio_centavos: 500000, por_peso: true },
      }),
    )) as Response;
    expect(alta.status).toBe(201);
    const j = (await alta.json()) as FichaHttp;
    expect(j.por_peso).toBe(true);

    const lista = (await getProducts(ctx("http://x/api/products?q=VP-PESO"))) as Response;
    const fichas = ((await lista.json()) as { productos: FichaHttp[] }).productos;
    expect(fichas.find((f) => f.sku === "VP-PESO")).toMatchObject({ por_peso: true, precioCentavos: 500000 });
  });

  it("edición activa y desactiva el flag mientras el producto no tiene ventas", async () => {
    await postProducts(
      ctx("http://x/api/products", { body: { sku: "VP-EDIT", nombre: "Tomates", precio_centavos: 900 } }),
    );
    const activar = (await patchProducts(
      ctx("http://x/api/products?sku=VP-EDIT", { method: "PATCH", body: { por_peso: true } }),
    )) as Response;
    expect(activar.status).toBe(200);
    expect(((await activar.json()) as FichaHttp).por_peso).toBe(true);

    const desactivar = (await patchProducts(
      ctx("http://x/api/products?sku=VP-EDIT", { method: "PATCH", body: { por_peso: false } }),
    )) as Response;
    expect(desactivar.status).toBe(200);
    expect(((await desactivar.json()) as FichaHttp).por_peso).toBe(false);
  });

  it("por_peso no booleano se rechaza con 422", async () => {
    await postProducts(
      ctx("http://x/api/products", { body: { sku: "VP-INVALIDO", nombre: "Invalido", precio_centavos: 900 } }),
    );
    const r = (await patchProducts(
      ctx("http://x/api/products?sku=VP-INVALIDO", { method: "PATCH", body: { por_peso: "si" } }),
    )) as Response;
    expect(r.status).toBe(422);
  });

  it("producto con ventas no puede cambiar el flag: error de dominio con mensaje", async () => {
    await postProducts(
      ctx("http://x/api/products", { body: { sku: "VP-VENDIDO", nombre: "Vendido", precio_centavos: 100, por_peso: true } }),
    );
    agregarLineaTicket({ sale_id: "sale-vp-1", product_id: "VP-VENDIDO", qty: 1, precio_centavos: "100" });

    const r = (await patchProducts(
      ctx("http://x/api/products?sku=VP-VENDIDO", { method: "PATCH", body: { por_peso: false } }),
    )) as Response;
    expect(r.status).toBe(422);
    const j = (await r.json()) as { error: string };
    expect(j.error).toMatch(/ticket|venta|históric/i);
  });
});

describe("T1 #385 panel: el catálogo muestra la unidad del precio", () => {
  it("etiqueta el precio por kilogramo solo cuando el flag está activo", () => {
    const base = { sku: "P", nombre: "Papas", precioCentavos: 500000 };
    expect(etiquetaPrecioCatalogo({ ...base, porPeso: true })).toBe("$ 5.000,00 / kg");
    expect(etiquetaPrecioCatalogo({ ...base, porPeso: false })).toBe("$ 5.000,00 / unidad");
    expect(etiquetaPrecioCatalogo(base)).toBe("$ 5.000,00 / unidad");
  });

  it("la tabla y el alta del panel muestran el flag y el aviso", () => {
    const tabla = readFileSync("src/components/panel/TablaCatalogo.tsx", "utf8");
    expect(tabla).toContain("etiquetaPrecioCatalogo");
    expect(tabla).toContain("Por peso");
    const alta = readFileSync("src/pages/panel/stock.astro", "utf8");
    expect(alta).toContain('id="alta-por-peso"');
    expect(alta).toContain('id="alta-aviso-por-peso"');
    expect(alta).toContain("avisoPorPeso");
  });
});

describe("T1 #385 formulario de alta: aviso y body", () => {
  it("el body incluye por_peso y el aviso explica la unidad", () => {
    const cuerpo = armarAltaProducto({
      nombre: "Papas",
      precioCentavos: 500000,
      entropiaSku: "vp-t1",
      porPeso: true,
    });
    expect(cuerpo).toMatchObject({ por_peso: true, precio_centavos: 500000 });
    expect(avisoPorPeso(true)).toContain("centavos por kilogramo");
    expect(avisoPorPeso(false)).toBe("");
  });
});

describe("T1 #385 snapshot offline: el flag viaja con el catálogo", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("el pull expone el mapa por_peso con el estado de cada producto", async () => {
    await postProducts(
      ctx("http://x/api/products", { body: { sku: "VP-OFF-P", nombre: "Peso", precio_centavos: 5000, por_peso: true } }),
    );
    await postProducts(
      ctx("http://x/api/products", { body: { sku: "VP-OFF-U", nombre: "Unidad", precio_centavos: 900 } }),
    );
    const r = (await getPull(ctx("http://x/api/sync/pull?cursor=0&limite=50"))) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { catalogo: { por_peso: Record<string, boolean> } };
    expect(j.catalogo.por_peso["VP-OFF-P"]).toBe(true);
    expect(j.catalogo.por_peso["VP-OFF-U"]).toBe(false);
  });

  it("la descarga guarda el flag por producto y sobrevive una lectura del snapshot", async () => {
    const storage = storageMemoria();
    const r = await descargarCatalogo({
      tenantId: "tenant-a",
      fetch: async () =>
        respuesta({
          catalogo: {
            stock: { "PESO-1": 5, "UNI-1": 3 },
            prices: { "PESO-1": 500000, "UNI-1": 900 },
            por_peso: { "PESO-1": true, "UNI-1": false },
          },
        }),
      storage,
      ahora: () => new Date("2026-11-21T12:00:00.000Z"),
    });
    expect(r.ok).toBe(true);
    expect(esPorPesoLocal(r.ok ? r.snapshot : null, "PESO-1")).toBe(true);
    expect(esPorPesoLocal(r.ok ? r.snapshot : null, "UNI-1")).toBe(false);
    expect(esPorPesoLocal(leerCatalogoLocal(storage, "tenant-a"), "PESO-1")).toBe(true);
  });

  it("snapshots y pulls viejos sin el flag siguen leyéndose como apagado", async () => {
    const storage = storageMemoria();
    storage.setItem(
      "offline:catalogo:tenant-a",
      JSON.stringify({
        version: 2,
        descargadoEl: "2026-11-21T12:00:00.000Z",
        productos: { "PESO-1": { stock: 5, precioCentavos: 500000 } },
        codigos: {},
      }),
    );
    expect(esPorPesoLocal(leerCatalogoLocal(storage, "tenant-a"), "PESO-1")).toBe(false);

    const r = await descargarCatalogo({
      tenantId: "tenant-b",
      fetch: async () =>
        respuesta({ catalogo: { stock: { "PESO-1": 5 }, prices: { "PESO-1": 500000 } } }),
      storage,
    });
    expect(r.ok).toBe(true);
    expect(esPorPesoLocal(r.ok ? r.snapshot : null, "PESO-1")).toBe(false);
  });
});

describe("T1 #385 migración nueva sin editar las aplicadas", () => {
  it("el journal trae el tag 0054 y el SQL agrega por_peso con default false", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.some((e) => e.tag === "0056_products_por_peso")).toBe(true);
    expect(journal.entries.length).toBeGreaterThanOrEqual(55);
    const sql = readFileSync("drizzle/0056_products_por_peso.sql", "utf8");
    expect(sql).toContain('"por_peso" boolean NOT NULL DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    for (const tag of ["0051_ggl_p240_gmail_dedupe_tenant", "0052_retencion_anonimiza_auditoria", "0053_servicios_pagos_tenant"]) {
      expect(journal.entries.some((e) => e.tag === tag)).toBe(true);
    }
  });

  it("el tag nuevo tiene su registro de migración", () => {
    const registro = JSON.parse(
      readFileSync("docs/roadmap/migraciones/0056_products_por_peso.json", "utf8"),
    ) as { tag: string };
    expect(registro.tag).toBe("0056_products_por_peso");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);

describe.skipIf(!hayPG)("T1 #385 multi PG: persistencia y aislamiento del flag", () => {
  const sku = `VP54${sufijo}`.toUpperCase();

  function fijarMulti(): void {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
    process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
  }

  beforeEach(() => {
    fijarMulti();
    resetStore();
  });

  it("por_peso persiste en A, el pull lo expone, B no lo ve y la edición lo cambia", async () => {
    fijarMulti();
    const alta = (await conTenant("tenant-a", () =>
      postProducts(
        ctx("http://x/api/products", {
          body: { sku, nombre: "Peso PG", precio_centavos: 500000, por_peso: true },
        }),
      ),
    )) as Response;
    expect(alta.status).toBe(201);
    expect(((await alta.json()) as FichaHttp).por_peso).toBe(true);

    const filas = await conTenant("tenant-a", () =>
      getTenantDb()
        .select({ porPeso: products.porPeso })
        .from(products)
        .where(eq(products.sku, sku)),
    );
    expect(filas[0]?.porPeso).toBe(true);

    const pullA = (await conTenant("tenant-a", () =>
      getPull(ctx("http://x/api/sync/pull?cursor=0&limite=50")),
    )) as Response;
    const jA = (await pullA.json()) as { catalogo: { por_peso: Record<string, boolean> } };
    expect(jA.catalogo.por_peso[sku]).toBe(true);

    const pullB = (await conTenant("tenant-b", () =>
      getPull(ctx("http://x/api/sync/pull?cursor=0&limite=50")),
    )) as Response;
    const jB = (await pullB.json()) as { catalogo: { por_peso: Record<string, boolean> } };
    expect(jB.catalogo.por_peso[sku]).toBeUndefined();

    const patch = (await conTenant("tenant-a", () =>
      patchProducts(ctx("http://x/api/products?sku=" + sku, { method: "PATCH", body: { por_peso: false } })),
    )) as Response;
    expect(patch.status).toBe(200);
    const trasPatch = await conTenant("tenant-a", () =>
      getTenantDb()
        .select({ porPeso: products.porPeso })
        .from(products)
        .where(eq(products.sku, sku)),
    );
    expect(trasPatch[0]?.porPeso).toBe(false);
  });
});
