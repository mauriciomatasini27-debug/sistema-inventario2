import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq, inArray } from "drizzle-orm";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, sales, ticketLines } from "../src/db/schema.js";
import { pricingAuditLog } from "../src/db/schema-precios.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { guardarPrecioPendiente, listarPendientesPrecio } from "../src/lib/repos/precio-pendiente.js";
import { GET as getPrecio, POST as postPrecio } from "../src/pages/api/stock/precio.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const AHORA = new Date("2026-10-20T12:00:00.000Z");

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

type Origen = "alta_al_vender" | "plantilla_rubro" | null;

function productoMemoria(
  sku: string,
  nombre: string,
  opts: { precio?: number; origen?: Origen; vendidas?: readonly number[] } = {},
): void {
  store.productos.set(sku, {
    sku,
    nombre,
    precioCentavos: opts.precio ?? 0,
    origen: opts.origen ?? null,
    sector: "general",
    locationId: null,
    archivado: false,
    controlaVencimiento: false,
    estado: "activo",
    minStock: null,
    reorderQty: null,
  });
  if (opts.origen === "alta_al_vender") store.altasAlVender.add(sku);
  for (const qty of opts.vendidas ?? []) {
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

function pedirPrecio(plano?: string) {
  return getPrecio(
    ctx("http://x/api/stock/precio", plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
  );
}

function enviarPrecio(body: Record<string, unknown>, plano?: string) {
  return postPrecio(
    ctx("http://x/api/stock/precio", {
      body,
      ...(plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
    }),
  );
}

describe("STOCK-S9 repo en memoria: pendientes de precio", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("ordena por vendidas, desempata por nombre y corta en 5 con el total", async () => {
    productoMemoria("S9-A", "Alfa", { origen: "plantilla_rubro", vendidas: [3] });
    productoMemoria("S9-B", "Beta", { origen: "plantilla_rubro", vendidas: [10, 2] });
    productoMemoria("S9-C", "Ce", { origen: "alta_al_vender", vendidas: [10] });
    productoMemoria("S9-D", "Dani", { origen: "plantilla_rubro" });
    productoMemoria("S9-E", "Eva", { origen: "alta_al_vender", vendidas: [5] });
    productoMemoria("S9-F", "Flor", { origen: "plantilla_rubro", vendidas: [2] });
    productoMemoria("S9-G", "Gabi", { origen: "plantilla_rubro" });
    productoMemoria("S9-H", "Normal", { origen: null, vendidas: [99] });
    productoMemoria("S9-I", "Con precio", { origen: "plantilla_rubro", precio: 500, vendidas: [99] });

    const r = await listarPendientesPrecio({ ahora: AHORA });

    expect(r.total).toBe(7);
    expect(r.items).toEqual([
      { sku: "S9-B", nombre: "Beta", vendidas30d: 12 },
      { sku: "S9-C", nombre: "Ce", vendidas30d: 10 },
      { sku: "S9-E", nombre: "Eva", vendidas30d: 5 },
      { sku: "S9-A", nombre: "Alfa", vendidas30d: 3 },
      { sku: "S9-F", nombre: "Flor", vendidas30d: 2 },
    ]);
  });

  it("desempata por nombre cuando las ventas son iguales", async () => {
    productoMemoria("S9-Z", "Zeta", { origen: "plantilla_rubro", vendidas: [4] });
    productoMemoria("S9-A", "Alfa", { origen: "plantilla_rubro", vendidas: [4] });

    const r = await listarPendientesPrecio({ limite: 5, ahora: AHORA });

    expect(r.items.map((i) => i.nombre)).toEqual(["Alfa", "Zeta"]);
  });

  it("guarda el precio, lo espeja y deja historial; el producto sale de pendientes", async () => {
    productoMemoria("S9-X", "Producto X", { origen: "plantilla_rubro", vendidas: [2] });
    productoMemoria("S9-Y", "Producto Y", { origen: "plantilla_rubro", vendidas: [1] });

    const r = await guardarPrecioPendiente("S9-X", 12345, "g-1");

    expect(r).toEqual({ ok: true });
    expect(store.productos.get("S9-X")?.precioCentavos).toBe(12345);
    expect(store.prices.get("S9-X")).toBe(12345);
    expect(store.auditoria).toEqual([
      { accion: "precio_completado", sku: "S9-X", antes: "0", despues: "12345", actor: "g-1" },
    ]);
    const pendientes = await listarPendientesPrecio({ ahora: AHORA });
    expect(pendientes.total).toBe(1);
    expect(pendientes.items.map((i) => i.sku)).toEqual(["S9-Y"]);
  });

  it("responde NO_PENDIENTE si ya tiene precio o su origen no es de plantilla o alta al vender", async () => {
    productoMemoria("S9-CON", "Con precio", { origen: "plantilla_rubro", precio: 100 });
    productoMemoria("S9-NORMAL", "Normal", { origen: null });

    expect(await guardarPrecioPendiente("S9-CON", 200, "g-1")).toEqual({ ok: false, codigo: "NO_PENDIENTE" });
    expect(await guardarPrecioPendiente("S9-NORMAL", 200, "g-1")).toEqual({ ok: false, codigo: "NO_PENDIENTE" });
    expect(await guardarPrecioPendiente("S9-FALTA", 200, "g-1")).toEqual({ ok: false, codigo: "NO_PENDIENTE" });
    expect(store.productos.get("S9-CON")?.precioCentavos).toBe(100);
    expect(store.auditoria).toEqual([]);
  });

  it("rechaza precio 0, negativos, decimales y fuera del tope", async () => {
    productoMemoria("S9-X", "Producto X", { origen: "plantilla_rubro" });

    for (const precio of [0, -1, 1.5, 1_000_000_000]) {
      expect(await guardarPrecioPendiente("S9-X", precio, "g-1")).toEqual({
        ok: false,
        codigo: "PRECIO_INVALIDO",
      });
    }
    expect(store.productos.get("S9-X")?.precioCentavos).toBe(0);
    expect(store.auditoria).toEqual([]);
  });
});

describe("STOCK-S9 GET y POST /api/stock/precio", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("sin sesión responde 403", async () => {
    expect((await pedirPrecio()).status).toBe(403);
    expect((await enviarPrecio({ sku: "S9-X", precio_centavos: 100 })).status).toBe(403);
  });

  it("un empleado no puede ver ni completar precios", async () => {
    comercio("empleado", "g-2");
    productoMemoria("S9-X", "Producto X", { origen: "plantilla_rubro" });
    const plano = sesion("g-2", "t-1");

    expect((await pedirPrecio(plano)).status).toBe(403);
    expect((await enviarPrecio({ sku: "S9-X", precio_centavos: 100 }, plano)).status).toBe(403);
  });

  it("el Dueño lista los pendientes y completa el precio", async () => {
    comercio();
    productoMemoria("S9-X", "Producto X", { origen: "plantilla_rubro", vendidas: [4] });
    productoMemoria("S9-Y", "Producto Y", { origen: "alta_al_vender", vendidas: [1] });
    const plano = sesion("g-1", "t-1");

    const get1 = await pedirPrecio(plano);
    expect(get1.status).toBe(200);
    expect(await get1.json()).toEqual({
      items: [
        { sku: "S9-X", nombre: "Producto X", vendidas30d: 4 },
        { sku: "S9-Y", nombre: "Producto Y", vendidas30d: 1 },
      ],
      total: 2,
    });

    const post = await enviarPrecio({ sku: "S9-X", precio_centavos: 7990 }, plano);
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ ok: true });

    const get2 = (await (await pedirPrecio(plano)).json()) as { total: number; items: unknown[] };
    expect(get2.total).toBe(1);
    expect(get2.items).toEqual([{ sku: "S9-Y", nombre: "Producto Y", vendidas30d: 1 }]);

    const repetido = await enviarPrecio({ sku: "S9-X", precio_centavos: 9000 }, plano);
    expect(repetido.status).toBe(409);
    expect(await repetido.json()).toEqual({ error: "NO_PENDIENTE" });
  });

  it("un cuerpo inválido responde 422", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");

    expect((await enviarPrecio({ sku: "S9-X", precio_centavos: 0 }, plano)).status).toBe(422);
    expect((await enviarPrecio({ sku: "S9-X", precio_centavos: 1.5 }, plano)).status).toBe(422);
    expect((await enviarPrecio({ sku: "S9-X", precio_centavos: 1_000_000_000 }, plano)).status).toBe(422);
    expect((await enviarPrecio({ sku: "", precio_centavos: 100 }, plano)).status).toBe(422);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);

describe.skipIf(!hayPG)("STOCK-S9 multi con PG: pendientes por precio 0 y auditoría", () => {
  const skuA = `S9A${sufijoPG}`.toUpperCase().slice(0, 32);
  const skuB = `S9B${sufijoPG}`.toUpperCase().slice(0, 32);
  const skuC = `S9C${sufijoPG}`.toUpperCase().slice(0, 32);
  const skuD = `S9D${sufijoPG}`.toUpperCase().slice(0, 32);
  const skuE = `S9E${sufijoPG}`.toUpperCase().slice(0, 32);
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
    basePriv = await asegurarBasePrivada("stock_s9_precio_a", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();

    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const filas = await db
        .insert(products)
        .values([
          filaPg({ sku: skuA, nombre: "Zeta", precioCentavos: 0n, stockActual: 0, origen: "plantilla_rubro" }),
          filaPg({ sku: skuB, nombre: "Alfa", precioCentavos: 0n, stockActual: 0, origen: "alta_al_vender" }),
          filaPg({ sku: skuC, nombre: "Beta", precioCentavos: 0n, stockActual: 0, origen: "plantilla_rubro" }),
          filaPg({ sku: skuD, nombre: "Delta", precioCentavos: 100n, stockActual: 0, origen: "plantilla_rubro" }),
          filaPg({ sku: skuE, nombre: "Normal", precioCentavos: 0n, stockActual: 0, origen: null }),
        ])
        .returning({ id: products.id, sku: products.sku });
      const idDe = new Map(filas.map((f) => [f.sku, f.id] as const));

      const haceUnDia = new Date(AHORA.getTime() - 24 * 60 * 60 * 1000);
      const haceCuarentaDias = new Date(AHORA.getTime() - 40 * 24 * 60 * 60 * 1000);
      await ventaDb(idDe.get(skuA) ?? "", 2, haceUnDia);
      await ventaDb(idDe.get(skuA) ?? "", 2, haceUnDia);
      await ventaDb(idDe.get(skuA) ?? "", 50, haceCuarentaDias);
      await ventaDb(idDe.get(skuB) ?? "", 9, haceUnDia);
      await ventaDb(idDe.get(skuC) ?? "", 2, haceUnDia);
      await ventaDb(idDe.get(skuD) ?? "", 100, haceUnDia);
      await ventaDb(idDe.get(skuE) ?? "", 80, haceUnDia);
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
      await db.delete(pricingAuditLog).where(inArray(pricingAuditLog.sku, todos));
      await db.delete(products).where(inArray(products.sku, todos));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  it("lista solo precio 0 de los orígenes válidos, por ventas de 30 días y nombre", async () => {
    fijarMulti();

    const r = await conTenant("tenant-a", () => listarPendientesPrecio({ ahora: AHORA }));

    expect(r.total).toBe(3);
    expect(r.items).toEqual([
      { sku: skuB, nombre: "Alfa", vendidas30d: 9 },
      { sku: skuA, nombre: "Zeta", vendidas30d: 4 },
      { sku: skuC, nombre: "Beta", vendidas30d: 2 },
    ]);
  });

  it("guarda el precio en products y deja auditoría sin tabla nueva", async () => {
    fijarMulti();

    expect(await conTenant("tenant-a", () => guardarPrecioPendiente(skuA, 12345, "g-1"))).toEqual({ ok: true });

    const estado = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const prods = await db.select().from(products).where(eq(products.sku, skuA));
      const audit = await db.select().from(pricingAuditLog).where(eq(pricingAuditLog.sku, skuA));
      return { prods, audit };
    });
    expect(estado.prods[0]?.precioCentavos).toBe(12345n);
    expect(estado.audit).toHaveLength(1);
    expect(estado.audit[0]?.actor).toBe("g-1");
    expect(estado.audit[0]?.antes).toEqual({ texto: "0" });
    expect(estado.audit[0]?.despues).toEqual({ texto: "12345" });
    expect(estado.audit[0]?.motivo).toBe("completar precio pendiente");

    const pendientes = await conTenant("tenant-a", () => listarPendientesPrecio({ ahora: AHORA }));
    expect(pendientes.total).toBe(2);
    expect(pendientes.items.map((i) => i.sku)).toEqual([skuB, skuC]);
    expect(await conTenant("tenant-a", () => guardarPrecioPendiente(skuA, 999, "g-1"))).toEqual({
      ok: false,
      codigo: "NO_PENDIENTE",
    });
  });

  it("dos guardados concurrentes dejan un solo ganador y una sola auditoría", async () => {
    fijarMulti();
    const sku = `S9R${sufijoPG}`.toUpperCase().slice(0, 32);
    todos.push(sku);
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db
        .insert(products)
        .values(filaPg({ sku, nombre: "Carrera", precioCentavos: 0n, stockActual: 0, origen: "plantilla_rubro" }));
    });

    // La fila queda tomada por otra conexión para que los dos guardados
    // pasen el control de pendiente antes de que cualquiera actualice:
    // sin el bloqueo la carrera TOCTOU no se reproduce de forma estable.
    const bloqueo = postgres(basePriv, { max: 1 });
    try {
      await bloqueo.unsafe("BEGIN");
      await bloqueo`select 1 from products where sku = ${sku} for update`;

      const pendientes = Promise.all([
        conTenant("tenant-a", async () => ({
          precio: 111,
          r: await guardarPrecioPendiente(sku, 111, "g-1"),
        })),
        conTenant("tenant-a", async () => ({
          precio: 222,
          r: await guardarPrecioPendiente(sku, 222, "g-2"),
        })),
      ]);
      await new Promise((res) => setTimeout(res, 300));
      await bloqueo.unsafe("COMMIT");

      const intentos = await pendientes;
      expect(intentos.filter((i) => i.r.ok)).toHaveLength(1);
      expect(intentos.filter((i) => !i.r.ok && i.r.codigo === "NO_PENDIENTE")).toHaveLength(1);

      const ganador = intentos.find((i) => i.r.ok);
      if (!ganador) throw new Error("sin ganador");

      const { prods, audit } = await conTenant("tenant-a", async () => {
        const db = getTenantDb();
        return {
          prods: await db.select().from(products).where(eq(products.sku, sku)),
          audit: await db.select().from(pricingAuditLog).where(eq(pricingAuditLog.sku, sku)),
        };
      });
      expect(prods[0]?.precioCentavos).toBe(BigInt(ganador.precio));
      expect(audit).toHaveLength(1);
      expect(audit[0]?.despues).toEqual({ texto: String(ganador.precio) });
    } finally {
      await bloqueo.end();
    }
  });

  it("precio 0 y precios fuera del tope no tocan la base", async () => {
    fijarMulti();

    expect(await conTenant("tenant-a", () => guardarPrecioPendiente(skuB, 0, "g-1"))).toEqual({
      ok: false,
      codigo: "PRECIO_INVALIDO",
    });
    expect(await conTenant("tenant-a", () => guardarPrecioPendiente(skuB, 1_000_000_000, "g-1"))).toEqual({
      ok: false,
      codigo: "PRECIO_INVALIDO",
    });

    const prods = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(products).where(eq(products.sku, skuB));
    });
    expect(prods[0]?.precioCentavos).toBe(0n);
    const pendientes = await conTenant("tenant-a", () => listarPendientesPrecio({ ahora: AHORA }));
    expect(pendientes.items.map((i) => i.sku)).toEqual([skuB, skuC]);
  });
});
