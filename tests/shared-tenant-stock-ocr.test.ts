import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mpWebhookEvents, stockLots } from "../src/db/schema.js";
import type { ItemCatalogo } from "../src/modules/pricing/precios.js";
import { crear_job } from "../src/modules/ocr/jobs.js";
import { getTenantDb } from "../src/lib/db.js";
import { altaProducto } from "../src/lib/repos/catalogo.js";
import { aplicarImportacionStock } from "../src/lib/repos/importaciones.js";
import { crearLote, listarLotes } from "../src/lib/repos/lotes.js";
import { reclamarEventoMp } from "../src/lib/repos/mp-webhooks.js";
import { crearJobRegistro, listarJobs } from "../src/lib/repos/ocr.js";
import { vincularPreaprobacionTenant } from "../src/lib/repos/planes.js";
import { registrarAjuste } from "../src/lib/repos/precios.js";
import { crearAlmacenAjustes, crearAlmacenProductos } from "../src/lib/repos/_almacen.js";
import { cargarStockInicial, listarPendientesStockInicial } from "../src/lib/repos/stock-inicial.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { tenantIdShared } from "../src/lib/tenant-scope.js";

const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
const hayPG = Boolean(process.env.PG_TEST_URL_A);

const ITEMS: ItemCatalogo[] = [
  { sku: "YERBA", vigenteCentavos: 10_000n, costoCentavos: 6_000n },
];

function guardarEnv(): Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> {
  const snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restaurarEnv(snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("P1-73 aislamiento shared memoria", () => {
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  it("sin conTenant en shared, tenantIdShared falla (no cae a global)", () => {
    expect(() => tenantIdShared()).toThrow(/Falta tenant/);
  });

  it("lotes: A no ve el lote de B", async () => {
    await conTenant("tenant-a", () =>
      altaProducto({
        sku: "LOTE-A",
        nombre: "Lote A",
        precioCentavos: 100,
        sector: "general",
        controlaVencimiento: false,
      }),
    );
    await conTenant("tenant-b", () =>
      altaProducto({
        sku: "LOTE-B",
        nombre: "Lote B",
        precioCentavos: 200,
        sector: "general",
        controlaVencimiento: false,
      }),
    );
    const ca = await conTenant("tenant-a", () =>
      crearLote({
        sku: "LOTE-A",
        cantidad: 3,
        venceEl: null,
        costoCentavos: 50,
        controlaVencimiento: false,
        idemKey: "lote-a-1",
      }),
    );
    const cb = await conTenant("tenant-b", () =>
      crearLote({
        sku: "LOTE-B",
        cantidad: 5,
        venceEl: null,
        costoCentavos: 80,
        controlaVencimiento: false,
        idemKey: "lote-b-1",
      }),
    );
    expect(ca.ok).toBe(true);
    expect(cb.ok).toBe(true);
    const la = await conTenant("tenant-a", () => listarLotes());
    const lb = await conTenant("tenant-b", () => listarLotes());
    expect(la.map((l) => l.sku)).toEqual(["LOTE-A"]);
    expect(lb.map((l) => l.sku)).toEqual(["LOTE-B"]);
  });

  it("importaciones: misma idemKey en A y B son independientes", async () => {
    const base = {
      idemKey: "imp-shared-1",
      archivo: { nombre: "a.csv", sha256: "abc", formato: "csv" as const },
      creadoPor: "dueno",
      totalFilas: 1,
      filasError: 0,
    };
    const fila = { sku: "IMP-X", nombre: "Import", precioCentavos: 500, cantidad: 2, sector: "general" };
    const ra = await conTenant("tenant-a", () => aplicarImportacionStock({ ...base, filasValidas: [fila] }));
    const rb = await conTenant("tenant-b", () => aplicarImportacionStock({ ...base, filasValidas: [fila] }));
    expect(ra.estado).toBe("nueva");
    expect(rb.estado).toBe("nueva");
    expect(ra.importacion.id).not.toBe(rb.importacion.id);
  });

  it("stock inicial: pendiente de A no aparece en B", async () => {
    await conTenant("tenant-a", () => {
      store.altasAlVender.add("INIT-A");
      crearAlmacenProductos().guardar("INIT-A", {
        sku: "INIT-A",
        nombre: "Pendiente A",
        precioCentavos: 100,
        sector: "general",
        locationId: null,
        archivado: false,
        controlaVencimiento: false,
        estado: "activo",
        minStock: null,
        reorderQty: null,
      });
    });
    const pa = await conTenant("tenant-a", () => listarPendientesStockInicial({ limite: 10 }));
    const pb = await conTenant("tenant-b", () => listarPendientesStockInicial({ limite: 10 }));
    expect(pa.items.map((i) => i.sku)).toContain("INIT-A");
    expect(pb.items.map((i) => i.sku)).not.toContain("INIT-A");
    const ok = await conTenant("tenant-b", () => cargarStockInicial("INIT-A", 1));
    expect(ok).toEqual({ ok: false, codigo: "NO_PENDIENTE" });
  });

  it("OCR: listarJobs no mezcla comercios", async () => {
    const ahora = "2026-11-14T12:00:00.000Z";
    const jobA = crear_job({
      jobId: randomUUID(),
      idempotencyKey: "ocr-key-a",
      origen: "wa",
      bytesRef: "b1",
      ahoraIso: ahora,
    });
    const jobB = crear_job({
      jobId: randomUUID(),
      idempotencyKey: "ocr-key-b",
      origen: "wa",
      bytesRef: "b2",
      ahoraIso: ahora,
    });
    await conTenant("tenant-a", () => crearJobRegistro(jobA));
    await conTenant("tenant-b", () => crearJobRegistro(jobB));
    const la = await conTenant("tenant-a", () => listarJobs());
    const lb = await conTenant("tenant-b", () => listarJobs());
    expect(la.map((j) => j.idempotencyKey)).toEqual(["ocr-key-a"]);
    expect(lb.map((j) => j.idempotencyKey)).toEqual(["ocr-key-b"]);
  });

  it("precios (memoria): ajuste de A no está en el almacén de B", async () => {
    const ahora = "2026-11-14T12:00:00.000Z";
    const r = await conTenant("tenant-a", () =>
      registrarAjuste({
        idempotencyKey: "aj-tenant-a",
        direccion: "suba",
        porcentaje: 10,
        vigenciaTipo: "ahora",
        aplicaEn: null,
        confirmado: true,
        online: true,
        creadoPor: "dueno",
        ahoraIso: ahora,
        items: ITEMS,
      }),
    );
    expect(r.ok).toBe(true);
    const mapaB = conTenant("tenant-b", () => [...crearAlmacenAjustes().comoMapaSoloLectura().keys()]);
    expect(mapaB).toEqual([]);
  });
});

describe.skipIf(!hayPG)("P1-73 aislamiento shared Postgres", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const loteIds: string[] = [];
  const clavesMp: string[] = [];
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    loteIds.length = 0;
    clavesMp.length = 0;
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
    resetStore();
  });

  afterEach(async () => {
    try {
      if (loteIds.length > 0 || clavesMp.length > 0) {
        const db = getTenantDb();
        for (const id of loteIds) {
          await db.delete(stockLots).where(eq(stockLots.id, id));
        }
        for (const clave of clavesMp) {
          await db.delete(mpWebhookEvents).where(eq(mpWebhookEvents.clave, clave));
        }
      }
    } finally {
      restaurarEnv(snap);
      resetStore();
    }
  });

  it("shared con DB sin tenant en contexto falla al listar lotes", async () => {
    await expect(listarLotes()).rejects.toThrow(/Falta tenant/);
  });

  it("insert de lote sella tenant_id y B no lo lee", async () => {
    await conTenant(tenantA, () =>
      altaProducto({
        sku: "PG-LOTE",
        nombre: "PG",
        precioCentavos: 100,
        sector: "general",
        controlaVencimiento: false,
      }),
    );
    const creado = await conTenant(tenantA, () =>
      crearLote({
        sku: "PG-LOTE",
        cantidad: 1,
        venceEl: null,
        costoCentavos: 10,
        controlaVencimiento: false,
        idemKey: `pg-lote-${randomUUID()}`,
      }),
    );
    expect(creado.ok).toBe(true);
    if (!creado.ok) return;
    loteIds.push(creado.lote.id);
    const filas = await conTenant(tenantA, async () => {
      const db = getTenantDb();
      return db.select({ tenantId: stockLots.tenantId }).from(stockLots).where(eq(stockLots.id, creado.lote.id));
    });
    expect(filas[0]?.tenantId).toBe(tenantA);
    const enB = await conTenant(tenantB, () => listarLotes());
    expect(enB).toHaveLength(0);
  });

  it("mp_webhook sella tenant_id si hubo vincularPreaprobacionTenant", async () => {
    const preId = `pre-${randomUUID()}`;
    vincularPreaprobacionTenant(preId, tenantA);
    const clave = `${preId}:activo`;
    clavesMp.push(clave);
    const ok = await reclamarEventoMp(clave, preId, "activo");
    expect(ok).toBe(true);
    const db = getTenantDb();
    const filas = await db.select().from(mpWebhookEvents).where(eq(mpWebhookEvents.clave, clave));
    expect(filas[0]?.tenantId).toBe(tenantA);
  });
});