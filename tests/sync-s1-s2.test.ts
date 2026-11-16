import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { POST as POSTPush } from "../src/pages/api/sync/push.js";
import { GET as GETPull } from "../src/pages/api/sync/pull.js";
import { leerLote } from "../src/lib/repos/sync.js";
import { crearAlmacenPrecios, crearAlmacenStock } from "../src/lib/repos/_almacen.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { outbox, products } from "../src/db/schema.js";
import { buscarProductosLocal } from "../src/offline/busqueda-local.js";
import { filaPg, tenantIdParaFixture } from "./helpers/pg-tenant-fixture.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function pushReq(op_id: string, seq: number) {
  return ctx("http://localhost/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": op_id },
    body: {
      op_id,
      device_code: "caja-01",
      device_seq: seq,
      hlc: `${Date.now()}:${seq}`,
      modulo: "sales",
      payload: { seq },
      client_occurred_at: new Date().toISOString(),
    },
  });
}

async function empujar(cantidad: number, desdeSeq = 1): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    const op = crypto.randomUUID();
    const res = (await POSTPush(pushReq(op, desdeSeq + i))) as Response;
    expect(res.status).toBe(201);
    ids.push(op);
  }
  return ids;
}

async function pull(cursor: string, limite?: string): Promise<{ status: number; json: PullJson }> {
  const q = new URLSearchParams({ cursor });
  if (limite !== undefined) q.set("limite", limite);
  const res = (await GETPull(ctx(`http://localhost/api/sync/pull?${q}`))) as Response;
  return { status: res.status, json: (await res.json()) as PullJson };
}

interface PullJson {
  movimientos: Array<{ op_id: string; payload: unknown }>;
  cursor_nuevo: string;
  mappings: unknown[];
  catalogo: { stock: Record<string, number>; prices: Record<string, number>; codes: Record<string, string> };
  total: number;
  fuente?: string;
}

function opIdsDe(json: PullJson): string[] {
  return json.movimientos.map((m) => m.op_id);
}

describe("SYNC-S1 pull por lotes con cursor estable (PRD-SYNC-01)", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("el repo topa el lote a 50 aunque pidan mas", async () => {
    await empujar(60);
    const lote = await leerLote(0, 200);
    expect(lote.movimientos.length).toBeLessThanOrEqual(50);
    expect(lote.movimientos.length).toBe(50);
  });

  it("inserciones entre paginas no duplican ni saltean filas", async () => {
    const primeros = await empujar(100);
    const p1 = await pull("0", "50");
    expect(p1.status).toBe(200);
    expect(opIdsDe(p1.json)).toEqual(primeros.slice(0, 50));
    expect(p1.json.cursor_nuevo).toBe("50");

    const agregados = await empujar(20, 101);
    void agregados;
    const p2 = await pull("50", "50");
    expect(p2.status).toBe(200);
    expect(opIdsDe(p2.json)).toEqual(primeros.slice(50, 100));
    expect(p2.json.cursor_nuevo).toBe("100");
    expect(p2.json.total).toBe(120);

    const p3 = await pull("100", "50");
    expect(p3.json.movimientos).toHaveLength(20);
    expect(p3.json.cursor_nuevo).toBe("120");
  });

  it("sin cambios devuelve vacio con el mismo cursor", async () => {
    await empujar(2);
    const p = await pull("2");
    expect(p.json.movimientos).toEqual([]);
    expect(p.json.cursor_nuevo).toBe("2");
  });
});

describe("SYNC-S2 pull completo con 10k productos en memoria", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("pagina el pull punta a punta con catalogo de 10k dentro del presupuesto", async () => {
    const stock = crearAlmacenStock();
    const precios = crearAlmacenPrecios();
    for (let i = 0; i < 10_000; i++) {
      const sku = `S1K${String(i).padStart(5, "0")}`;
      stock.guardar(sku, i % 100);
      precios.guardar(sku, 100 + i);
    }
    const ids = await empujar(120);

    const inicio = Date.now();
    const vistos: string[] = [];
    let cursor = "0";
    let paginas = 0;
    let tamCatalogo = 0;
    for (;;) {
      const p = await pull(cursor, "50");
      expect(p.status).toBe(200);
      const movs = p.json.movimientos;
      expect(movs.length).toBeLessThanOrEqual(50);
      tamCatalogo = Object.keys(p.json.catalogo.stock).length;
      expect(p.json.catalogo).toHaveProperty("codes");
      vistos.push(...opIdsDe(p.json));
      paginas += 1;
      const nuevo = p.json.cursor_nuevo as string;
      if (movs.length === 0) {
        expect(nuevo).toBe(cursor);
        break;
      }
      cursor = nuevo;
      if (paginas > 10) throw new Error("paginado no termina");
    }
    const ms = Date.now() - inicio;
    expect(vistos).toEqual(ids);
    expect(tamCatalogo).toBeGreaterThanOrEqual(10_000);
    expect(ms).toBeLessThan(15_000);
  }, 20_000);
});

describe("SYNC-S2 busqueda difusa local sin red (src/offline)", () => {
  const catalogo = [
    { sku: "YERBA-01", nombre: "Yerba Mate Suave" },
    { sku: "CAFE-02", nombre: "Café Molido" },
    { sku: "AZUCAR-03", nombre: "Azúcar Común" },
  ];

  it("ignora tildes y mayusculas", () => {
    expect(buscarProductosLocal(catalogo, "cafe").map((c) => c.sku)).toEqual(["CAFE-02"]);
    expect(buscarProductosLocal(catalogo, "AZUCAR").map((c) => c.sku)).toEqual(["AZUCAR-03"]);
  });

  it("coincide por prefijo de token", () => {
    expect(buscarProductosLocal(catalogo, "yer").map((c) => c.sku)).toEqual(["YERBA-01"]);
  });

  it("tolera un typo chico", () => {
    expect(buscarProductosLocal(catalogo, "yerva").map((c) => c.sku)).toEqual(["YERBA-01"]);
  });

  it("sin coincidencia devuelve vacio y query vacia devuelve todo", () => {
    expect(buscarProductosLocal(catalogo, "zzz")).toEqual([]);
    expect(buscarProductosLocal(catalogo, "")).toHaveLength(3);
  });

  it("respeta el limite", () => {
    expect(buscarProductosLocal(catalogo, "", 2)).toHaveLength(2);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 8);
const prefijoPG = `S1P${sufijoPG}`.toUpperCase();

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

function limpiarMulti() {
  delete process.env.TENANT_MODE;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

describe.skipIf(!hayPG)("SYNC-S1/S2 en PG local: cursor por tenant + catalogo de 10k DB-first", () => {
  const opIds: string[] = Array.from({ length: 100 }, () => crypto.randomUUID());

  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(outbox).where(inArray(outbox.opId, opIds));
      await db.delete(products).where(sql`${products.sku} LIKE ${`${prefijoPG}%`}`);
    });
    resetStore();
    limpiarMulti();
  });

  it("siembra 10k productos en A, pagina el outbox sin perder filas y B no ve el catalogo", async () => {
    fijarMulti();
    const filas = Array.from({ length: 10_000 }, (_, i) => ({
      sku: `${prefijoPG}${String(i).padStart(5, "0")}`,
      nombre: `Prod S1 ${i}`,
      precioCentavos: 100 + i,
      stockActual: i % 100,
    }));
    await conTenant("tenant-a", async () => {
      // Columnas explícitas: la base local puede no tener sector/location_id
      // (mismo drift que tolera altaProducto con su insert crudo).
      const db = getTenantDb();
      const tid = tenantIdParaFixture();
      const valores = filas.map((f) => sql`(${tid}, ${f.sku}, ${f.nombre}, ${f.precioCentavos}, ${f.stockActual})`);
      await db.execute(
        sql`insert into products (tenant_id, sku, nombre, precio_centavos, stock_actual) values ${sql.join(valores, sql`, `)} on conflict do nothing`,
      );
      await getTenantDb().insert(outbox).values(
        opIds.map((opId, i) =>
          filaPg({
            opId,
            deviceCode: "caja-01",
            deviceSeq: 1000 + i,
            hlc: `${Date.now()}:${1000 + i}`,
            modulo: "sales",
            payload: { seq: i },
          }),
        ),
      );
    });

    const inicio = Date.now();
    const vistos: string[] = [];
    let cursor = "0";
    let tamCatalogo = 0;
    let fuente: string | undefined;
    for (let pag = 0; pag < 10; pag++) {
      const res = (await conTenant("tenant-a", () =>
        GETPull(ctx(`http://localhost/api/sync/pull?cursor=${cursor}&limite=50`)),
      )) as Response;
      expect(res.status).toBe(200);
      const j = (await res.json()) as PullJson;
      expect(j.movimientos.length).toBeLessThanOrEqual(50);
      tamCatalogo = Object.keys(j.catalogo.stock).length;
      fuente = j.fuente;
      vistos.push(...j.movimientos.map((m) => m.op_id));
      if (j.movimientos.length === 0) {
        expect(j.cursor_nuevo).toBe(cursor);
        break;
      }
      cursor = j.cursor_nuevo;
    }
    const ms = Date.now() - inicio;
    expect(vistos).toHaveLength(100);
    expect(new Set(vistos)).toEqual(new Set(opIds));
    expect(tamCatalogo).toBeGreaterThanOrEqual(10_000);
    expect(fuente).toBe("db");
    expect(ms).toBeLessThan(60_000);

    const resB = (await conTenant("tenant-b", () =>
      GETPull(ctx("http://localhost/api/sync/pull?cursor=0&limite=50")),
    )) as Response;
    expect(resB.status).toBe(200);
    const enB = (await resB.json()) as PullJson;
    expect(Object.keys(enB.catalogo.stock).filter((s) => s.startsWith(prefijoPG))).toEqual([]);
    expect(enB.movimientos.map((m) => m.op_id).filter((id) => opIds.includes(id))).toEqual([]);
  }, 90_000);
});
