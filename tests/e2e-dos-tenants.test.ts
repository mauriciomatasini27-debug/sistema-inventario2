import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { cashMovements, products, sales, stockMovements, ticketPayments, tickets } from "../src/db/schema.js";
import { GET as getSesion } from "../src/pages/api/auth/sesion-actual.js";
import { POST as postAlta } from "../src/pages/api/onboarding/alta.js";
import { POST as postTenants } from "../src/pages/api/tenants.js";
import { GET as getProducts, POST as postProducts } from "../src/pages/api/products.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { GET as getTicket } from "../src/pages/api/tickets.js";
import { POST as postCashMovements } from "../src/pages/api/cash/movements.js";
import { GET as getCashBalance } from "../src/pages/api/cash/balance.js";
import { GET as getCashHistory } from "../src/pages/api/cash/history.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijo = `p3d2${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.toLowerCase().slice(0, 24);
const tokenA = `${sufijo}a`;
const tokenB = `${sufijo}b`;
const skuA = `P3D2A-${sufijo}`.toUpperCase().slice(0, 40);
const skuB = `P3D2B-${sufijo}`.toUpperCase().slice(0, 40);
const ventaKeyA = `p3d2-venta-a-${sufijo}`;
const ventaKeyB = `p3d2-venta-b-${sufijo}`;
const cajaKeyA = `p3d2-caja-a-${sufijo}`;
const cajaKeyB = `p3d2-caja-b-${sufijo}`;
const subA = `p3d2-dueno-a-${sufijo}`;
const subB = `p3d2-dueno-b-${sufijo}`;
const subSuper = `p3d2-super-${sufijo}`;
const altaKeyA = `p3d2-alta-a-${sufijo}`;
const altaKeyB = `p3d2-alta-b-${sufijo}`;
const deviceA = `P3D2-A-${sufijo}`.toUpperCase().slice(0, 24);
const deviceB = `P3D2-B-${sufijo}`.toUpperCase().slice(0, 24);
const ventas: string[] = [];

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

function sesionEnStore(sub: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: null,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function conCookie(plano: string, init: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
  return ctx("http://x/api", {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { cookie: `__Host-sesion=${plano}`, ...(init.headers ?? {}) },
    ...(init.body === undefined ? {} : { body: init.body }),
  });
}

function ventaBody(sku: string, device: string) {
  return {
    lineas: [{ product_id: sku, qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: device,
    seq_local: 1,
    client_occurred_at: new Date().toISOString(),
    offline: false,
  };
}

function cajaBody() {
  return {
    tipo: "ingreso",
    metodo: "Efectivo",
    categoria_id: "general",
    origen: "devolucion",
    monto_centavos: 7000,
    device_code: "caja-01",
    seq_local: 1,
    client_occurred_at: new Date().toISOString(),
  };
}

async function borrarRastro() {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      for (const saleId of ventas) {
        await db.delete(stockMovements).where(eq(stockMovements.idemKey, ventaKeyA));
        await db.delete(stockMovements).where(eq(stockMovements.idemKey, ventaKeyB));
        await db.delete(ticketPayments).where(eq(ticketPayments.saleId, saleId));
        await db.delete(cashMovements).where(eq(cashMovements.saleId, saleId));
        await db.delete(tickets).where(eq(tickets.saleId, saleId));
        await db.delete(sales).where(eq(sales.id, saleId));
      }
      await db.delete(cashMovements).where(eq(cashMovements.idempotencyKey, cajaKeyA));
      await db.delete(cashMovements).where(eq(cashMovements.idempotencyKey, cajaKeyB));
      await db.delete(products).where(eq(products.sku, skuA));
      await db.delete(products).where(eq(products.sku, skuB));
    });
  }
}

describe.skipIf(!hayPG)("P3-2d PRD-E2E-01: flujo demo de dos tenants aislados contra PG local", () => {
  let planoA = "";
  let planoB = "";
  let ticketA = "";
  let ticketB = "";
  let superPrevio: string | undefined;

  beforeAll(() => {
    fijarMulti();
    resetStore();
    planoA = sesionEnStore(subA);
    planoB = sesionEnStore(subB);
    superPrevio = process.env.ADMIN_ALLOWLIST_SUBS;
    process.env.ADMIN_ALLOWLIST_SUBS = subSuper;
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastro();
    if (superPrevio === undefined) delete process.env.ADMIN_ALLOWLIST_SUBS;
    else process.env.ADMIN_ALLOWLIST_SUBS = superPrevio;
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
    resetStore();
  });

  it("alta/login simulado: dos sesiones fake, alta idempotente y admin 403 sin permiso", async () => {
    fijarMulti();
    const sA = (await getSesion(conCookie(planoA))) as Response;
    expect(sA.status).toBe(200);
    expect(((await sA.json()) as { logueado: boolean }).logueado).toBe(true);
    const sB = (await getSesion(conCookie(planoB))) as Response;
    expect(((await sB.json()) as { logueado: boolean }).logueado).toBe(true);
    const sNadie = (await getSesion(ctx("http://x/api/auth/sesion-actual"))) as Response;
    expect(((await sNadie.json()) as { logueado: boolean }).logueado).toBe(false);

    const cuerpo = { nombre_comercio: `Kiosco P3D2 A ${sufijo}`, rubro: "kiosco", request_key: altaKeyA };
    const a1 = (await postAlta(conCookie(planoA, { body: cuerpo }))) as Response;
    expect([201, 409]).toContain(a1.status);
    const j1 = (await a1.json()) as { tenant_id: string };
    expect(typeof j1.tenant_id).toBe("string");
    const a2 = (await postAlta(conCookie(planoA, { body: cuerpo }))) as Response;
    expect(a2.status).toBe(409);
    expect(((await a2.json()) as { tenant_id: string }).tenant_id).toBe(j1.tenant_id);

    const comun = (await postTenants(
      conCookie(planoB, {
        body: {
          nombre_comercio: `Almacen P3D2 ${sufijo}`,
          plan: "demo",
          moneda: "ARS",
          owner_google_sub: subB,
          request_key: altaKeyB,
        },
      }),
    )) as Response;
    expect(comun.status).toBe(403);

    const planoSuper = sesionEnStore(subSuper);
    const admin = (await postTenants(
      conCookie(planoSuper, {
        body: {
          nombre_comercio: `Almacen P3D2 ${sufijo}`,
          plan: "demo",
          moneda: "ARS",
          owner_google_sub: subB,
          request_key: altaKeyB,
        },
      }),
    )) as Response;
    expect(admin.status).toBe(201);
    const jAdmin = (await admin.json()) as { tenant_id: string; membership_dueno: { rol: string } | null };
    expect(typeof jAdmin.tenant_id).toBe("string");
    expect(jAdmin.membership_dueno?.rol).toBe("dueno");
  });

  it("producto: el alta de A no se ve en B y viceversa", async () => {
    fijarMulti();
    const rA = await conTenant("tenant-a", () =>
      postProducts(ctx("http://x/api/products", { body: { sku: skuA, nombre: `Prod demo ${tokenA}`, precio_centavos: 15000 } })),
    );
    expect((rA as Response).status).toBe(201);
    expect(((await (rA as Response).json()) as { sku: string }).sku).toBe(skuA);
    const rB = await conTenant("tenant-b", () =>
      postProducts(ctx("http://x/api/products", { body: { sku: skuB, nombre: `Prod demo ${tokenB}`, precio_centavos: 15000 } })),
    );
    expect((rB as Response).status).toBe(201);
    expect(((await (rB as Response).json()) as { sku: string }).sku).toBe(skuB);

    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.execute(sql`update products set stock_actual = 10 where sku in (${skuA}, ${skuB})`);
      });
    }

    const listaAenA = await conTenant("tenant-a", () => getProducts(ctx(`http://x/api/products?q=${tokenA}`)));
    const jListaAenA = (await (listaAenA as Response).json()) as { productos: Array<{ sku: string }>; fuente: string };
    expect(jListaAenA.fuente).toBe("db");
    const skusAenA = (jListaAenA.productos ?? []).map((p) => p.sku);
    expect(skusAenA).toContain(skuA);
    const listaAenB = await conTenant("tenant-b", () => getProducts(ctx(`http://x/api/products?q=${tokenA}`)));
    const skusAenB = (((await (listaAenB as Response).json()) as { productos: Array<{ sku: string }> }).productos ?? []).map(
      (p) => p.sku,
    );
    expect(skusAenB).not.toContain(skuA);

    const listaBenB = await conTenant("tenant-b", () => getProducts(ctx(`http://x/api/products?q=${tokenB}`)));
    const skusBenB = (((await (listaBenB as Response).json()) as { productos: Array<{ sku: string }> }).productos ?? []).map(
      (p) => p.sku,
    );
    expect(skusBenB).toContain(skuB);
    const listaBenA = await conTenant("tenant-a", () => getProducts(ctx(`http://x/api/products?q=${tokenB}`)));
    const skusBenA = (((await (listaBenA as Response).json()) as { productos: Array<{ sku: string }> }).productos ?? []).map(
      (p) => p.sku,
    );
    expect(skusBenA).not.toContain(skuB);
  });

  it("venta y ticket: cada tenant cobra lo suyo y el otro responde 404", async () => {
    fijarMulti();
    const vA = await conTenant("tenant-a", () =>
      postSales(
        ctx("http://x/api/sales", {
          method: "POST",
          headers: { "Idempotency-Key": ventaKeyA },
          body: ventaBody(skuA, deviceA),
        }),
      ),
    );
    expect((vA as Response).status).toBe(201);
    const jA = (await (vA as Response).json()) as {
      sale_id: string;
      ticket_definitivo: string | null;
      ticket_provisorio: string;
      fuente: string;
    };
    expect(jA.fuente).toBe("db");
    ventas.push(jA.sale_id);
    ticketA = jA.ticket_definitivo ?? jA.ticket_provisorio;
    expect(ticketA.length).toBeGreaterThan(0);

    const vB = await conTenant("tenant-b", () =>
      postSales(
        ctx("http://x/api/sales", {
          method: "POST",
          headers: { "Idempotency-Key": ventaKeyB },
          body: ventaBody(skuB, deviceB),
        }),
      ),
    );
    expect((vB as Response).status).toBe(201);
    const jB = (await (vB as Response).json()) as {
      sale_id: string;
      ticket_definitivo: string | null;
      ticket_provisorio: string;
    };
    ventas.push(jB.sale_id);
    ticketB = jB.ticket_definitivo ?? jB.ticket_provisorio;

    const tAenA = await conTenant("tenant-a", () => getTicket(ctx(`http://x/api/tickets?numero=${encodeURIComponent(ticketA)}`)));
    expect((tAenA as Response).status).toBe(200);
    const tAenB = await conTenant("tenant-b", () => getTicket(ctx(`http://x/api/tickets?numero=${encodeURIComponent(ticketA)}`)));
    expect((tAenB as Response).status).toBe(404);

    const tBenB = await conTenant("tenant-b", () => getTicket(ctx(`http://x/api/tickets?numero=${encodeURIComponent(ticketB)}`)));
    expect((tBenB as Response).status).toBe(200);
    const tBenA = await conTenant("tenant-a", () => getTicket(ctx(`http://x/api/tickets?numero=${encodeURIComponent(ticketB)}`)));
    expect((tBenA as Response).status).toBe(404);
  });

  it("caja: movimientos y lecturas aislados por tenant en ambas direcciones", async () => {
    fijarMulti();
    const mA = await conTenant("tenant-a", () =>
      postCashMovements(
        ctx("http://x/api/cash/movements", { body: cajaBody(), headers: { "Idempotency-Key": cajaKeyA } }),
      ),
    );
    expect((mA as Response).status).toBe(201);
    const mB = await conTenant("tenant-b", () =>
      postCashMovements(
        ctx("http://x/api/cash/movements", { body: cajaBody(), headers: { "Idempotency-Key": cajaKeyB } }),
      ),
    );
    expect((mB as Response).status).toBe(201);

    const bA = await conTenant("tenant-a", () => getCashBalance(ctx("http://x/api/cash/balance")));
    expect((bA as Response).status).toBe(200);
    expect(((await (bA as Response).json()) as { fuente: string }).fuente).toBe("db");
    const bB = await conTenant("tenant-b", () => getCashBalance(ctx("http://x/api/cash/balance")));
    expect((bB as Response).status).toBe(200);
    expect(((await (bB as Response).json()) as { fuente: string }).fuente).toBe("db");

    const hA = await conTenant("tenant-a", () => getCashHistory(ctx("http://x/api/cash/history?limit=200")));
    const keysA = (
      ((await (hA as Response).json()) as { items: Array<{ idempotency_key: string }> }).items ?? []
    ).map((i) => i.idempotency_key);
    expect(keysA).toContain(cajaKeyA);
    expect(keysA).toContain(ventaKeyA);
    expect(keysA).not.toContain(cajaKeyB);
    expect(keysA).not.toContain(ventaKeyB);

    const hB = await conTenant("tenant-b", () => getCashHistory(ctx("http://x/api/cash/history?limit=200")));
    const keysB = (
      ((await (hB as Response).json()) as { items: Array<{ idempotency_key: string }> }).items ?? []
    ).map((i) => i.idempotency_key);
    expect(keysB).toContain(cajaKeyB);
    expect(keysB).toContain(ventaKeyB);
    expect(keysB).not.toContain(cajaKeyA);
    expect(keysB).not.toContain(ventaKeyA);
  });
});
