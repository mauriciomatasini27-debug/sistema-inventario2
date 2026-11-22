import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { products, stockLots, stockMovements } from "../src/db/schema.js";
import { ctx } from "./helpers/ctx.js";
import { getTenantDb } from "../src/lib/db.js";
import { aplicarImportacionStock } from "../src/lib/repos/importaciones.js";
import { crearAlmacenLotes, crearAlmacenStock } from "../src/lib/repos/_almacen.js";
import { crearLote, invarianteStockLotesMovs, listarLotesDetalle } from "../src/lib/repos/lotes.js";
import { sembrarControlApp } from "../src/lib/control-app-dev.js";
import { idLoteGenerico, lotesDesdeStockGenerico } from "../src/modules/inventario/lote-generico.js";
import { aplicarVentaLotes, listarMovimientos, nivelStock } from "../src/lib/repos/stock.js";
import { cargarStockInicial } from "../src/lib/repos/stock-inicial.js";
import { POST as confirmarImportar } from "../src/pages/api/stock/importar/confirmar.js";
import { POST as POSTCounts, PATCH as PATCHCounts } from "../src/pages/api/counts.js";
import { POST as POSTConteoSector } from "../src/pages/api/stock/conteo.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
const UUID_LOTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function altaMemoria(sku: string): void {
  store.altasAlVender.add(sku);
  store.productos.set(sku, {
    sku,
    nombre: sku,
    precioCentavos: 0,
    sector: "general",
    locationId: null,
    archivado: false,
    controlaVencimiento: false,
    estado: "activo",
    minStock: null,
    reorderQty: null,
  });
}

async function invariante(sku: string): Promise<void> {
  const lotes = await listarLotesDetalle(sku);
  const sumaLotes = lotes.reduce((a, l) => a + l.cantidadRestante, 0);
  const sumaMovs = (await listarMovimientos())
    .filter((m) => m.sku === sku)
    .reduce((a, m) => a + m.delta, 0);
  expect(invarianteStockLotesMovs({ stockActual: nivelStock(sku), lotesCantidadRestante: sumaLotes, movsDeltaSum: sumaMovs })).toBe(true);
}

function csvImport(sku: string, cantidad: number): string {
  return `sku,nombre,precio,cantidad\n${sku},Producto,10,${cantidad}\n`;
}

function formImport(texto: string): FormData {
  const fd = new FormData();
  fd.append("archivo", new Blob([texto], { type: "text/csv" }), "stock.csv");
  fd.append("archivo_sha256", createHash("sha256").update(texto).digest("hex"));
  return fd;
}

describe("AUD-VTA-05 T02 lote genérico en memoria", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
    resetStore();
  });

  it("carga inicial crea un Lote genérico y su movimiento apunta a él", async () => {
    const sku = `T02INI${sufijo}`;
    altaMemoria(sku);
    const r = await cargarStockInicial(sku, 7);
    expect(r).toEqual({ ok: true });
    const lotes = await listarLotesDetalle(sku);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.venceEl).toBeNull();
    expect(UUID_LOTE.test(lotes[0]?.id ?? "")).toBe(true);
    expect(lotes[0]?.cantidadRestante).toBe(7);
    expect(nivelStock(sku)).toBe(7);
    const movs = (await listarMovimientos()).filter((m) => m.sku === sku);
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: "ALTA", delta: 7, loteId: lotes[0]?.id });
    await invariante(sku);
  });

  it("importar stock crea un Lote genérico y otra importación lo actualiza", async () => {
    const sku = `T02IMP${sufijo}`.toUpperCase();
    const csv1 = csvImport(sku, 3);
    const r1 = (await confirmarImportar(
      ctx("http://x/api/stock/importar/confirmar", {
        form: formImport(csv1),
        headers: { "Idempotency-Key": `t02-imp-a-${sufijo}` },
      }),
    )) as Response;
    expect(r1.status).toBe(201);
    let lotes = await listarLotesDetalle(sku);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.id).toBe(idLoteGenerico(sku));
    expect(lotes[0]?.venceEl).toBeNull();
    expect(lotes[0]?.cantidadRestante).toBe(3);
    expect(nivelStock(sku)).toBe(3);

    const csv2 = csvImport(sku, 2);
    const r2 = (await confirmarImportar(
      ctx("http://x/api/stock/importar/confirmar", {
        form: formImport(csv2),
        headers: { "Idempotency-Key": `t02-imp-b-${sufijo}` },
      }),
    )) as Response;
    expect(r2.status).toBe(201);
    lotes = await listarLotesDetalle(sku);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.cantidadRestante).toBe(5);
    expect(nivelStock(sku)).toBe(5);
    const movs = (await listarMovimientos()).filter((m) => m.sku === sku && m.idemKey.startsWith("import:"));
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.loteId === idLoteGenerico(sku))).toBe(true);
    await invariante(sku);
  });

  it("confirmar conteo crea el Lote genérico y el ajuste apunta a él", async () => {
    const sku = `T02CON${sufijo}`.toUpperCase();
    const semilla = await crearLote({ sku, cantidad: 10, venceEl: null, costoCentavos: 100, controlaVencimiento: false, idemKey: `t02-con-seed-${sufijo}` });
    expect(semilla.ok).toBe(true);
    const creado = (await POSTCounts(
      ctx("http://x/api/counts", {
        body: { contado_por: "emp1", lineas: [{ sku, fisico: 8 }] },
        headers: { "Idempotency-Key": `t02-count-${sufijo}` },
      }),
    )) as Response;
    expect(creado.status).toBe(201);
    const { id } = (await creado.json()) as { id: string };
    const confirmado = (await PATCHCounts(
      ctx(`http://x/api/counts?id=${id}`, {
        method: "PATCH",
        body: { rol: "dueno", confirmado_por: "due1", motivo: "faltante" },
      }),
    )) as Response;
    expect(confirmado.status).toBe(200);
    const lotes = await listarLotesDetalle(sku);
    expect(lotes.some((l) => l.id === idLoteGenerico(sku))).toBe(true);
    expect(lotes.reduce((a, l) => a + l.cantidadRestante, 0)).toBe(8);
    expect(nivelStock(sku)).toBe(8);
    const movs = (await listarMovimientos()).filter((m) => m.sku === sku && m.tipo === "AJUSTE_CONTEO");
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ delta: -2, loteId: idLoteGenerico(sku) });
    await invariante(sku);
  });

  it("conteo por sector crea el Lote genérico y el ajuste apunta a él", async () => {
    const sku = `T02SEC${sufijo}`.toUpperCase();
    const semilla = await crearLote({ sku, cantidad: 10, venceEl: null, costoCentavos: 100, controlaVencimiento: false, idemKey: `t02-sec-seed-${sufijo}` });
    expect(semilla.ok).toBe(true);
    store.productSectores.set(sku, "general");
    const r = (await POSTConteoSector(
      ctx("http://x/api/stock/conteo", {
        body: { sector: "general", lineas: [{ sku, fisico: 13 }], motivo: "conteo general" },
        headers: { "Idempotency-Key": `t02-sector-${sufijo}` },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    const lotes = await listarLotesDetalle(sku);
    expect(lotes.some((l) => l.id === idLoteGenerico(sku))).toBe(true);
    expect(lotes.reduce((a, l) => a + l.cantidadRestante, 0)).toBe(13);
    expect(nivelStock(sku)).toBe(13);
    const movs = (await listarMovimientos()).filter((m) => m.sku === sku && m.tipo === "COMPENSATORIO");
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ delta: 3, loteId: idLoteGenerico(sku) });
    await invariante(sku);
  });

  it("lotesDesdeStock apunta al Lote genérico, nunca a un Lote virtual", () => {
    const sku = `T02FEFO${sufijo}`.toUpperCase();
    const lotes = lotesDesdeStockGenerico(new Map([[sku, 5]]));
    expect(lotes).toHaveLength(1);
    expect(String(lotes[0]?.id)).toBe(idLoteGenerico(sku));
    expect(String(lotes[0]?.id)).not.toContain("seed-");
  });

  it("sembrar el entorno de ejemplo crea Lotes genéricos persistidos", async () => {
    const r = await sembrarControlApp();
    expect(r.status).toBe(200);
    const lotes = await listarLotesDetalle("CAFE-001");
    const generico = lotes.find((l) => l.id === idLoteGenerico("CAFE-001"));
    expect(generico).toBeDefined();
    expect(generico?.cantidadRestante).toBe(12);
    expect(generico?.venceEl).toBeNull();
  });
});

describe.skipIf(!hayPG)("AUD-VTA-05 T02 lote genérico con Postgres", () => {
  let basePriv = "";
  const skus: string[] = [];
  const keys: string[] = [];

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  function skuNuevo(marca: string): string {
    const sku = `T02${marca}${sufijo}`.toUpperCase().slice(0, 32);
    skus.push(sku);
    return sku;
  }

  function keyNueva(marca: string): string {
    const key = `t02-${marca}-${sufijo}`;
    keys.push(key);
    return key;
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("aud_vta_05_t02", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    if (!basePriv) return;
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      if (keys.length > 0) await db.delete(stockMovements).where(inArray(stockMovements.idemKey, keys));
      if (skus.length > 0) {
        await db.delete(stockLots).where(inArray(stockLots.sku, skus));
        await db.delete(products).where(inArray(products.sku, skus));
      }
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  it("carga inicial con base crea y persiste el Lote genérico", async () => {
    fijarMulti();
    const sku = skuNuevo("ini");
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(products).values(filaPg({ sku, nombre: sku, precioCentavos: 1000n, stockActual: 0, origen: "alta_al_vender" }));
    });
    const r = await conTenant("tenant-a", () => cargarStockInicial(sku, 6));
    expect(r).toEqual({ ok: true });
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const lotes = await db.select().from(stockLots).where(eq(stockLots.sku, sku));
      expect(lotes).toHaveLength(1);
      expect(lotes[0]?.venceEl).toBeNull();
      expect(UUID_LOTE.test(lotes[0]?.id ?? "")).toBe(true);
      expect(lotes[0]?.cantidadRestante).toBe(6);
      const movs = await db.select().from(stockMovements).where(eq(stockMovements.sku, sku));
      expect(movs).toHaveLength(1);
      expect(movs[0]).toMatchObject({ tipo: "ALTA", delta: 6, loteId: lotes[0]?.id });
      const prods = await db.select().from(products).where(eq(products.sku, sku));
      expect(prods[0]?.stockActual).toBe(6);
    });
  });

  it("importar con base crea o actualiza el Lote genérico por el escritor único", async () => {
    fijarMulti();
    const sku = skuNuevo("imp");
    const entrada = (cantidad: number, key: string) => ({
      idemKey: key,
      archivo: { nombre: "stock.csv", sha256: key, formato: "csv" as const },
      creadoPor: "t02",
      filasValidas: [{ sku, nombre: sku, precioCentavos: 100, cantidad, sector: "general" }],
      totalFilas: 1,
      filasError: 0,
    });
    keys.push(`import:${sku}`);
    const r1 = await conTenant("tenant-a", () => aplicarImportacionStock(entrada(4, `imp-a-${sufijo}`)));
    expect(r1.estado).toBe("nueva");
    const r2 = await conTenant("tenant-a", () => aplicarImportacionStock(entrada(6, `imp-b-${sufijo}`)));
    expect(r2.estado).toBe("nueva");
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const lotes = await db.select().from(stockLots).where(eq(stockLots.sku, sku));
      expect(lotes).toHaveLength(1);
      expect(lotes[0]?.id).toBe(idLoteGenerico(sku));
      expect(lotes[0]?.cantidadRestante).toBe(10);
      const movs = await db.select().from(stockMovements).where(eq(stockMovements.sku, sku));
      expect(movs).toHaveLength(2);
      expect(movs.every((m) => m.loteId === idLoteGenerico(sku))).toBe(true);
      const prods = await db.select().from(products).where(eq(products.sku, sku));
      expect(prods[0]?.stockActual).toBe(10);
    });
  });

  it("vender stock entrado sin Lote descuenta un Lote genérico real, sin Lote virtual", async () => {
    fijarMulti();
    const sku = skuNuevo("ven");
    const key = keyNueva("ven");
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(products).values(filaPg({ sku, nombre: sku, precioCentavos: 1000n, stockActual: 10 }));
    });
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.transaction(async (tx) => {
        await aplicarVentaLotes(tx, { skus: [sku], offline: false, ahora: new Date() }, async (lotes) => {
          expect(lotes).toHaveLength(1);
          expect(String(lotes[0]?.id)).toBe(idLoteGenerico(sku));
          expect(UUID_LOTE.test(String(lotes[0]?.id))).toBe(true);
          return {
            consumo: { idemKey: key, bajarCantidades: true, tomas: [{ loteId: lotes[0]!.id, sku: lotes[0]!.sku, cantidad: 4 }] },
            valor: undefined,
          };
        });
      });
    });
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const lotes = await db.select().from(stockLots).where(eq(stockLots.sku, sku));
      expect(lotes).toHaveLength(1);
      expect(lotes[0]?.id).toBe(idLoteGenerico(sku));
      expect(lotes[0]?.cantidadRestante).toBe(6);
      const movs = await db.select().from(stockMovements).where(eq(stockMovements.idemKey, key));
      expect(movs).toHaveLength(1);
      expect(movs[0]).toMatchObject({ delta: -4, tipo: "VENTA", loteId: idLoteGenerico(sku) });
      const prods = await db.select().from(products).where(eq(products.sku, sku));
      expect(prods[0]?.stockActual).toBe(6);
    });
  });
});
