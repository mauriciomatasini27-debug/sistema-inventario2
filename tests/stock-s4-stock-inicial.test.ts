import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, sales, stockMovements, ticketLines } from "../src/db/schema.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { aplicarMovimiento } from "../src/lib/repos/stock.js";
import {
  cargarStockInicial,
  listarPendientesStockInicial,
} from "../src/lib/repos/stock-inicial.js";
import { GET as getInicial, POST as postInicial } from "../src/pages/api/stock/inicial.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const AHORA = new Date("2026-10-20T12:00:00.000Z");

// P10-20: la sesión del fixture vence a los 30 días de AHORA y la ruta compara
// ventas de los últimos 30 días contra el reloj real; fijar solo Date deja
// vivos los timers.
beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function altaMemoria(
  sku: string,
  nombre: string,
  vendidas: readonly number[] = [],
): void {
  store.altasAlVender.add(sku);
  store.productos.set(sku, {
    sku,
    nombre,
    precioCentavos: 0,
    sector: "general",
    locationId: null,
    archivado: false,
    controlaVencimiento: false,
    estado: "activo",
    minStock: null,
    reorderQty: null,
  });
  for (const qty of vendidas) {
    store.ticketLineas.push({
      sale_id: crypto.randomUUID(),
      product_id: sku,
      qty,
      precio_centavos: "0",
    });
  }
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

function comercio(rol: "dueno" | "empleado" = "dueno", sub = "g-1") {
  control.tenants.set("t-1", {
    id: "t-1",
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "g-1",
    esDemo: false,
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

function pedirInicial(plano?: string) {
  return getInicial(
    ctx("http://x/api/stock/inicial", plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
  );
}

function enviarInicial(body: Record<string, unknown>, plano?: string) {
  return postInicial(
    ctx("http://x/api/stock/inicial", {
      body,
      ...(plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
    }),
  );
}

describe("STOCK-S4 repo en memoria: pendientes de stock inicial", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("ordena por vendidas, desempata por nombre y corta en 5 con el total", async () => {
    altaMemoria("S4-A", "Alfa", [3]);
    altaMemoria("S4-B", "Beta", [10, 2]);
    altaMemoria("S4-C", "Ce", [10]);
    altaMemoria("S4-D", "Dani");
    altaMemoria("S4-E", "Eva", [5]);
    altaMemoria("S4-F", "Flor", [2]);
    altaMemoria("S4-G", "Gabi");

    const r = await listarPendientesStockInicial({ ahora: AHORA });

    expect(r.total).toBe(7);
    expect(r.items).toEqual([
      { sku: "S4-B", nombre: "Beta", vendidas30d: 12 },
      { sku: "S4-C", nombre: "Ce", vendidas30d: 10 },
      { sku: "S4-E", nombre: "Eva", vendidas30d: 5 },
      { sku: "S4-A", nombre: "Alfa", vendidas30d: 3 },
      { sku: "S4-F", nombre: "Flor", vendidas30d: 2 },
    ]);
  });

  it("desempata por nombre cuando las ventas son iguales", async () => {
    altaMemoria("S4-Z", "Zeta", [4]);
    altaMemoria("S4-A", "Alfa", [4]);

    const r = await listarPendientesStockInicial({ limite: 5, ahora: AHORA });

    expect(r.items.map((i) => i.nombre)).toEqual(["Alfa", "Zeta"]);
  });

  it("un ALTA saca el producto de pendientes y baja el total", async () => {
    altaMemoria("S4-X", "Producto X", [2]);
    altaMemoria("S4-Y", "Producto Y", [1]);

    await aplicarMovimiento({
      idemKey: "otra-alta:S4-X",
      sku: "S4-X",
      loteId: null,
      delta: 1,
      tipo: "ALTA",
    });

    const r = await listarPendientesStockInicial({ ahora: AHORA });

    expect(r.total).toBe(1);
    expect(r.items.map((i) => i.sku)).toEqual(["S4-Y"]);
  });

  it("cargarStockInicial aplica un ALTA y deja origen como historial", async () => {
    altaMemoria("S4-X", "Producto X", [2]);

    const r = await cargarStockInicial("S4-X", 3);

    expect(r).toEqual({ ok: true });
    expect(store.stockMoves).toEqual([
      {
        idemKey: "stock-inicial:S4-X",
        sku: "S4-X",
        loteId: null,
        delta: 3,
        tipo: "ALTA",
        motivo: "stock inicial",
      },
    ]);
    expect(store.stock.get("S4-X")).toBe(3);
    expect(store.altasAlVender.has("S4-X")).toBe(true);
    expect((await listarPendientesStockInicial({ ahora: AHORA })).total).toBe(0);
  });

  it("cantidad 0 también registra el ALTA y saca el producto de pendientes", async () => {
    altaMemoria("S4-X", "Producto X", [2]);

    const r = await cargarStockInicial("S4-X", 0);

    expect(r).toEqual({ ok: true });
    expect(store.stockMoves).toHaveLength(1);
    expect(store.stockMoves[0]?.delta).toBe(0);
    expect(store.stockMoves[0]?.tipo).toBe("ALTA");
    expect((await listarPendientesStockInicial({ ahora: AHORA })).total).toBe(0);
  });

  it("responde NO_PENDIENTE para un SKU que no es alta al vender", async () => {
    store.productos.set("S4-NORMAL", {
      sku: "S4-NORMAL",
      nombre: "Normal",
      precioCentavos: 100,
      sector: "general",
      locationId: null,
      archivado: false,
      controlaVencimiento: false,
      estado: "activo",
      minStock: null,
      reorderQty: null,
    });

    expect(await cargarStockInicial("S4-NORMAL", 1)).toEqual({ ok: false, codigo: "NO_PENDIENTE" });
  });

  it("responde NO_PENDIENTE si ya tiene un ALTA", async () => {
    altaMemoria("S4-X", "Producto X", [2]);
    await aplicarMovimiento({
      idemKey: "otra-alta:S4-X",
      sku: "S4-X",
      loteId: null,
      delta: 1,
      tipo: "ALTA",
    });

    expect(await cargarStockInicial("S4-X", 1)).toEqual({ ok: false, codigo: "NO_PENDIENTE" });
    expect(store.stockMoves).toHaveLength(1);
  });
});

describe("STOCK-S4 GET y POST /api/stock/inicial", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("sin sesión responde 403", async () => {
    expect((await pedirInicial()).status).toBe(403);
    expect((await enviarInicial({ sku: "S4-X", cantidad: 1 })).status).toBe(403);
  });

  it("un empleado no puede ver ni cargar el stock inicial", async () => {
    comercio("empleado", "g-2");
    altaMemoria("S4-X", "Producto X");
    const plano = sesion("g-2", "t-1");

    expect((await pedirInicial(plano)).status).toBe(403);
    expect((await enviarInicial({ sku: "S4-X", cantidad: 1 }, plano)).status).toBe(403);
  });

  it("el Dueño lista los pendientes y carga la cantidad", async () => {
    comercio();
    altaMemoria("S4-X", "Producto X", [4]);
    altaMemoria("S4-Y", "Producto Y", [1]);
    const plano = sesion("g-1", "t-1");

    const get1 = await pedirInicial(plano);
    expect(get1.status).toBe(200);
    expect(await get1.json()).toEqual({
      items: [
        { sku: "S4-X", nombre: "Producto X", vendidas30d: 4 },
        { sku: "S4-Y", nombre: "Producto Y", vendidas30d: 1 },
      ],
      total: 2,
    });

    const post = await enviarInicial({ sku: "S4-X", cantidad: 7 }, plano);
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ ok: true });

    const get2 = (await (await pedirInicial(plano)).json()) as { total: number; items: unknown[] };
    expect(get2.total).toBe(1);
    expect(get2.items).toEqual([{ sku: "S4-Y", nombre: "Producto Y", vendidas30d: 1 }]);
  });

  it("un SKU que ya no está pendiente responde 409", async () => {
    comercio();
    altaMemoria("S4-X", "Producto X");
    const plano = sesion("g-1", "t-1");
    expect((await enviarInicial({ sku: "S4-X", cantidad: 1 }, plano)).status).toBe(200);
    expect((await enviarInicial({ sku: "S4-X", cantidad: 1 }, plano)).status).toBe(409);
  });

  it("un cuerpo inválido responde 422", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");

    expect((await enviarInicial({ sku: "S4-X", cantidad: -1 }, plano)).status).toBe(422);
    expect((await enviarInicial({ sku: "S4-X", cantidad: 1.5 }, plano)).status).toBe(422);
    expect((await enviarInicial({ sku: "", cantidad: 1 }, plano)).status).toBe(422);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);

describe.skipIf(!hayPG)("STOCK-S4 multi con PG: ventana de 30 días y ALTA", () => {
  const skuA = `S4A${sufijoPG}`.toUpperCase().slice(0, 32);
  const skuB = `S4B${sufijoPG}`.toUpperCase().slice(0, 32);
  const skuC = `S4C${sufijoPG}`.toUpperCase().slice(0, 32);
  const skuD = `S4D${sufijoPG}`.toUpperCase().slice(0, 32);
  const skuE = `S4E${sufijoPG}`.toUpperCase().slice(0, 32);
  const todos = [skuA, skuB, skuC, skuD, skuE];
  let basePriv = "";
  const saleIds: string[] = [];
  const keys: string[] = [];

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  async function ventaDb(productId: string, qty: number, creada: Date): Promise<void> {
    const key = crypto.randomUUID();
    keys.push(key);
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const fila = await db
        .insert(sales)
        .values(
          filaPg({
            idempotencyKey: key,
            medio: "Efectivo",
            totalCentavos: BigInt(qty * 100),
            clientOccurredAt: creada,
            createdAt: creada,
          }),
        )
        .returning({ id: sales.id });
      const saleId = fila[0]?.id ?? "";
      saleIds.push(saleId);
      await db.insert(ticketLines).values(filaPg({ saleId, productId, qty, precioCentavos: 100n }));
    });
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("stock_s4_inicial_a", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();

    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const altas = [skuA, skuB, skuC, skuD];
      const filas = await db
        .insert(products)
        .values(
          altas.map((sku) =>
            filaPg({
              sku,
              nombre: sku === skuA ? "Zeta" : sku === skuB ? "Alfa" : sku === skuC ? "Beta" : "Delta",
              precioCentavos: 100n,
              stockActual: 0,
              origen: "alta_al_vender",
            }),
          ),
        )
        .returning({ id: products.id, sku: products.sku });
      const normal = await db
        .insert(products)
        .values(
          filaPg({
            sku: skuE,
            nombre: "Normal",
            precioCentavos: 100n,
            stockActual: 0,
            origen: null,
          }),
        )
        .returning({ id: products.id });
      const idDe = new Map(filas.map((f) => [f.sku, f.id] as const));
      idDe.set(skuE, normal[0]?.id ?? "");

      const haceUnDia = new Date(AHORA.getTime() - 24 * 60 * 60 * 1000);
      const haceCuarentaDias = new Date(AHORA.getTime() - 40 * 24 * 60 * 60 * 1000);
      await ventaDb(idDe.get(skuA) ?? "", 2, haceUnDia);
      await ventaDb(idDe.get(skuA) ?? "", 2, haceUnDia);
      await ventaDb(idDe.get(skuA) ?? "", 50, haceCuarentaDias);
      await ventaDb(idDe.get(skuB) ?? "", 9, haceUnDia);
      await ventaDb(idDe.get(skuC) ?? "", 2, haceUnDia);
      await ventaDb(idDe.get(skuD) ?? "", 100, haceUnDia);
      await ventaDb(idDe.get(skuE) ?? "", 80, haceUnDia);
      await db.insert(stockMovements).values(
        filaPg({
          idemKey: `stock-s4-previa:${skuD}`,
          sku: skuD,
          loteId: null,
          delta: 1,
          tipo: "ALTA",
        }),
      );
    });
  });

  afterAll(async () => {
    if (!basePriv) return;
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      if (saleIds.length > 0) {
        await db.delete(ticketLines).where(inArray(ticketLines.saleId, saleIds));
        await db.delete(sales).where(inArray(sales.id, saleIds));
      }
      await db.delete(stockMovements).where(inArray(stockMovements.sku, todos));
      await db.delete(products).where(inArray(products.sku, todos));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  it("lista por ventas de los últimos 30 días, sin ALTA y con orden desc", async () => {
    fijarMulti();

    const r = await conTenant("tenant-a", () => listarPendientesStockInicial({ ahora: AHORA }));

    expect(r.total).toBe(3);
    expect(r.items).toEqual([
      { sku: skuB, nombre: "Alfa", vendidas30d: 9 },
      { sku: skuA, nombre: "Zeta", vendidas30d: 4 },
      { sku: skuC, nombre: "Beta", vendidas30d: 2 },
    ]);
  });

  it("cargarStockInicial escribe stock_movements ALTA y products.stock_actual", async () => {
    fijarMulti();

    const r = await conTenant("tenant-a", () => cargarStockInicial(skuA, 5));
    expect(r).toEqual({ ok: true });

    const estado = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const movs = await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.sku, skuA));
      const prods = await db.select().from(products).where(eq(products.sku, skuA));
      return { movs, prods };
    });

    expect(estado.movs).toHaveLength(1);
    expect(estado.movs[0]?.tipo).toBe("ALTA");
    expect(estado.movs[0]?.delta).toBe(5);
    expect(estado.movs[0]?.idemKey).toBe(`stock-inicial:${skuA}`);
    expect(estado.movs[0]?.motivo).toBe("stock inicial");
    expect(estado.prods[0]?.stockActual).toBe(5);
    expect(estado.prods[0]?.origen).toBe("alta_al_vender");

    const pendientes = await conTenant("tenant-a", () => listarPendientesStockInicial({ ahora: AHORA }));
    expect(pendientes.total).toBe(2);
    expect(pendientes.items.map((i) => i.sku)).toEqual([skuB, skuC]);
    expect(await conTenant("tenant-a", () => cargarStockInicial(skuA, 1))).toEqual({
      ok: false,
      codigo: "NO_PENDIENTE",
    });
  });

  it("cantidad 0 registra el ALTA y saca de pendientes", async () => {
    fijarMulti();

    expect(await conTenant("tenant-a", () => cargarStockInicial(skuB, 0))).toEqual({ ok: true });

    const estado = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const movs = await db.select().from(stockMovements).where(eq(stockMovements.sku, skuB));
      const prods = await db.select().from(products).where(eq(products.sku, skuB));
      return { movs, prods };
    });
    expect(estado.movs).toHaveLength(1);
    expect(estado.movs[0]?.delta).toBe(0);
    expect(estado.prods[0]?.stockActual).toBe(0);
    const pendientes = await conTenant("tenant-a", () => listarPendientesStockInicial({ ahora: AHORA }));
    expect(pendientes.items.map((i) => i.sku)).toEqual([skuC]);
  });
});
