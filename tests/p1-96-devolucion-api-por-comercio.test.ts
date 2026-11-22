import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cashMovements,
  products,
  sales,
  stockLots,
  stockMovements,
  ticketCounters,
  ticketLines,
  ticketPayments,
  tickets,
} from "../src/db/schema.js";
import { saleReturns, ticketDiscounts } from "../src/db/schema-tickets.js";
import { getTenantDb } from "../src/lib/db.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";
import { POST as postReturns } from "../src/pages/api/returns.js";
import { ctx } from "./helpers/ctx.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

// P1-96 (ADR-0122) Seam B: la API de devoluciones numera por comercio en la
// Postgres compartida. Dos tenant_id distintos pueden emitir D-000001 y
// D-000002 sin chocar, y el reenvío de la key devuelve el original con 409.

const PG = process.env.PG_TEST_URL_A;
const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
let tenantA = "";
let tenantB = "";
const skus: string[] = [];
const saleIds: string[] = [];
const keys: string[] = [];
const cookies = new Map<string, string>();

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

function sembrarIdentidad(tenantId: string, sub: string): void {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: tenantId,
    slug: tenantId,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.memberships.set(`${tenantId}:${sub}`, {
    id: `${tenantId}:${sub}`,
    tenantId,
    googleSub: sub,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  const ahora = new Date();
  const sesion = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(sesion.registro.idHash, {
    idHash: sesion.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: sesion.registro.expiraAt,
    expiraAbsoluta: sesion.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  cookies.set(tenantId, `__Host-sesion=${sesion.idPlano}`);
}

async function sembrarProducto(tenantId: string): Promise<string> {
  const sku = `P96${randomUUID().slice(0, 8)}`.toUpperCase();
  skus.push(sku);
  await conTenant(tenantId, () =>
    getTenantDb().insert(products).values(filaPg({ sku, nombre: "P1-96", precioCentavos: 1000n, stockActual: 10 }, tenantId)),
  );
  return sku;
}

async function vender(tenantId: string, sku: string): Promise<string> {
  const r = await conTenant(tenantId, () =>
    registrar_venta({
      key: `p96-venta-${randomUUID()}`,
      lineas: [{ product_id: sku, qty: 1, precio_centavos: 1000 }],
      medio: "Efectivo",
      deviceCode: "caja-p96",
      seqLocal: 1,
      offline: false,
      clientOccurredAt: new Date().toISOString(),
    }),
  );
  if (!r.ok) throw new Error(`venta rechazada: ${r.codigo ?? JSON.stringify(r)}`);
  saleIds.push(r.venta.saleId);
  return r.venta.saleId;
}

function devolver(tenantId: string, saleId: string, sku: string, key: string): Promise<Response> {
  keys.push(key);
  return conTenant(tenantId, () =>
    postReturns(
      ctx("http://x/api/returns", {
        method: "POST",
        headers: { "Idempotency-Key": key, cookie: cookies.get(tenantId)!, "X-Tenant-Id": tenantId },
        body: {
          sale_id: saleId,
          monto_centavos: 1000,
          items: [{ product_id: sku, qty: 1 }],
          medio: "Efectivo",
          motivo: "p1-96",
          actor: "duena",
          client_occurred_at: new Date().toISOString(),
        },
      }),
    ),
  ) as Promise<Response>;
}

async function devolucionesDe(tenantId: string): Promise<typeof saleReturns.$inferSelect[]> {
  return conTenant(tenantId, () =>
    getTenantDb()
      .select()
      .from(saleReturns)
      .where(and(eq(saleReturns.tenantId, tenantId), inArray(saleReturns.idempotencyKey, keys))),
  );
}

async function contadorDe(tenantId: string): Promise<number | undefined> {
  const filas = await conTenant(tenantId, () =>
    getTenantDb()
      .select({ ultimo: ticketCounters.ultimo })
      .from(ticketCounters)
      .where(and(eq(ticketCounters.tenantId, tenantId), eq(ticketCounters.id, "devolucion"))),
  );
  return filas[0]?.ultimo;
}

describe.skipIf(!PG)("P1-96 API /api/returns: D-* por comercio (Seam B)", () => {
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = PG;
    delete process.env.CONTROL_DATABASE_URL;
    tenantA = randomUUID();
    tenantB = randomUUID();
    cookies.clear();
    sembrarIdentidad(tenantA, "sub-a");
    sembrarIdentidad(tenantB, "sub-b");
  });

  afterEach(async () => {
    for (const tid of [tenantA, tenantB]) {
      await conTenant(tid, async () => {
        const db = getTenantDb();
        await db.delete(saleReturns).where(inArray(saleReturns.idempotencyKey, keys));
        await db.delete(cashMovements).where(inArray(cashMovements.saleId, saleIds));
        await db.delete(stockMovements).where(inArray(stockMovements.idemKey, keys));
        await db.delete(ticketDiscounts).where(inArray(ticketDiscounts.saleId, saleIds));
        await db.delete(ticketLines).where(inArray(ticketLines.saleId, saleIds));
        await db.delete(ticketPayments).where(inArray(ticketPayments.saleId, saleIds));
        await db.delete(tickets).where(inArray(tickets.saleId, saleIds));
        await db.delete(sales).where(inArray(sales.id, saleIds));
        await db.delete(ticketCounters).where(eq(ticketCounters.tenantId, tid));
        await db.delete(stockLots).where(inArray(stockLots.sku, skus));
        await db.delete(products).where(inArray(products.sku, skus));
      });
    }
    skus.length = 0;
    saleIds.length = 0;
    keys.length = 0;
    restaurarEnv(snap);
    resetStore();
  });

  it("dos comercios emiten cada uno D-000001 y D-000002 sin colisiones", async () => {
    const skuA = await sembrarProducto(tenantA);
    const skuB = await sembrarProducto(tenantB);
    const ventasA = [await vender(tenantA, skuA), await vender(tenantA, skuA)];
    const ventasB = [await vender(tenantB, skuB), await vender(tenantB, skuB)];

    const a1 = await devolver(tenantA, ventasA[0]!, skuA, `p96-a-1-${randomUUID()}`);
    const a2 = await devolver(tenantA, ventasA[1]!, skuA, `p96-a-2-${randomUUID()}`);
    expect(a1.status).toBe(201);
    expect(a2.status).toBe(201);
    expect(((await a1.json()) as { numero_devolucion: string }).numero_devolucion).toBe("D-000001");
    expect(((await a2.json()) as { numero_devolucion: string }).numero_devolucion).toBe("D-000002");

    const b1 = await devolver(tenantB, ventasB[0]!, skuB, `p96-b-1-${randomUUID()}`);
    const b2 = await devolver(tenantB, ventasB[1]!, skuB, `p96-b-2-${randomUUID()}`);
    expect(b1.status).toBe(201);
    expect(b2.status).toBe(201);
    expect(((await b1.json()) as { numero_devolucion: string }).numero_devolucion).toBe("D-000001");
    expect(((await b2.json()) as { numero_devolucion: string }).numero_devolucion).toBe("D-000002");

    // El número persistido pertenece al comercio que lo emitió y el contador
    // de cada serie quedó en su propio tenant, sin arrastrar el máximo ajeno.
    expect((await devolucionesDe(tenantA)).map((f) => [f.tenantId, f.numeroDevolucion]).sort()).toEqual([
      [tenantA, "D-000001"],
      [tenantA, "D-000002"],
    ]);
    expect((await devolucionesDe(tenantB)).map((f) => [f.tenantId, f.numeroDevolucion]).sort()).toEqual([
      [tenantB, "D-000001"],
      [tenantB, "D-000002"],
    ]);
    expect(await contadorDe(tenantA)).toBe(2);
    expect(await contadorDe(tenantB)).toBe(2);
  });

  it("reenviar la misma Idempotency-Key responde 409 con el original y no consume número", async () => {
    const sku = await sembrarProducto(tenantA);
    const venta1 = await vender(tenantA, sku);
    const venta2 = await vender(tenantA, sku);
    const key = `p96-replay-${randomUUID()}`;

    const primera = await devolver(tenantA, venta1, sku, key);
    expect(primera.status).toBe(201);
    const original = (await primera.json()) as { numero_devolucion: string };
    expect(original.numero_devolucion).toBe("D-000001");
    const contadorAntes = await contadorDe(tenantA);
    expect(contadorAntes).toBe(1);

    const reenvio = await devolver(tenantA, venta1, sku, key);
    expect(reenvio.status).toBe(409);
    const cuerpo = (await reenvio.json()) as { original: { numero_devolucion: string; sale_id: string } };
    expect(cuerpo.original).toEqual({ numero_devolucion: original.numero_devolucion, sale_id: venta1 });
    expect(await contadorDe(tenantA)).toBe(contadorAntes);

    const siguiente = await devolver(tenantA, venta2, sku, `p96-tras-replay-${randomUUID()}`);
    expect(siguiente.status).toBe(201);
    expect(((await siguiente.json()) as { numero_devolucion: string }).numero_devolucion).toBe("D-000002");
    expect((await devolucionesDe(tenantA)).length).toBe(2);
  });
});
