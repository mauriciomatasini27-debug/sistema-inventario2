import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { sales } from "../src/db/schema.js";
import { saleReturns, ticketPaymentCorrections } from "../src/db/schema-tickets.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { POST as postReturns } from "../src/pages/api/returns.js";
import { POST as postCorreccion } from "../src/pages/api/sales/medium-corrections.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/sales.ts",
  "src/pages/api/returns.ts",
  "src/pages/api/sales/medium-corrections.ts",
];

function importaStoreBinding(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

function rutasApi(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...rutasApi(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("PERS2-S25/S26 AT17: sales, returns y medium-corrections sin store (ADR-0063)", () => {
  it("las 3 rutas no importan el binding store (import type y control se permiten)", () => {
    const mal = RUTAS_SIN_STORE.filter(importaStoreBinding);
    expect(mal).toEqual([]);
  });

  it("ningún archivo bajo src/pages/api importa el binding store (contador global 0)", () => {
    const mal = rutasApi("src/pages/api").filter(importaStoreBinding);
    expect(mal).toEqual([]);
  });
});

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function ventaBody(over: Record<string, unknown> = {}) {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: 1,
    client_occurred_at: new Date().toISOString(),
    offline: false,
    ...over,
  };
}

function req(url: string, key: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

function devolucionBody(saleId: string, monto: number, over: Record<string, unknown> = {}) {
  return {
    sale_id: saleId,
    monto_centavos: monto,
    items: [{ product_id: "demo-sku-1", qty: 1 }],
    medio: "Efectivo",
    motivo: "cliente arrepentido",
    actor: "dueno",
    client_occurred_at: new Date().toISOString(),
    ...over,
  };
}

describe("PERS2-S25/S26 single sin DB: ventas, devoluciones y correcciones como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("POST /api/sales => 201 con sale_id y fiscal_estado", async () => {
    const r = (await postSales({ request: req("http://x/api/sales", `pers2-v-${Date.now()}-a`, ventaBody()) } as never)) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { sale_id: string; fiscal_estado: string; total_centavos: string };
    expect(j.sale_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(j.fiscal_estado).toBe("pendiente");
    expect(j.total_centavos).toBe("15000");
  });

  it("venta + devolución parcial => 201 espera_cae; repetida => 409; sobre tope => 422", async () => {
    const v = (await postSales({ request: req("http://x/api/sales", `pers2-v-${Date.now()}-b`, ventaBody()) } as never)) as Response;
    expect(v.status).toBe(201);
    const { sale_id } = (await v.json()) as { sale_id: string };

    const dkey = `pers2-d-${Date.now()}-1`;
    const d1 = (await postReturns({ request: req("http://x/api/returns", dkey, devolucionBody(sale_id, 5000)) } as never)) as Response;
    expect(d1.status).toBe(201);
    const j1 = (await d1.json()) as { fiscal_estado: string; nc_tipo: number; numero_devolucion: string };
    expect(j1.fiscal_estado).toBe("espera_cae");
    expect(j1.nc_tipo).toBe(13);
    expect(j1.numero_devolucion).toBe("D-000001");

    const dup = (await postReturns({ request: req("http://x/api/returns", dkey, devolucionBody(sale_id, 5000)) } as never)) as Response;
    expect(dup.status).toBe(409);

    const tope = (await postReturns({ request: req("http://x/api/returns", `pers2-d-${Date.now()}-2`, devolucionBody(sale_id, 15001)) } as never)) as Response;
    expect(tope.status).toBe(422);
  });

  it("venta + corrección de medio => 201 antes/despues; repetida => 409", async () => {
    const v = (await postSales({ request: req("http://x/api/sales", `pers2-v-${Date.now()}-c`, ventaBody()) } as never)) as Response;
    expect(v.status).toBe(201);
    const { sale_id } = (await v.json()) as { sale_id: string };

    const key = `pers2-c-${Date.now()}`;
    const c = (await postCorreccion({
      request: req("http://x/api/sales/medium-corrections", key, { sale_id, medio_nuevo: "QR", motivo: "cliente pide QR", actor: "dueno-1" }),
    } as never)) as Response;
    expect(c.status).toBe(201);
    const cj = (await c.json()) as { antes: string; despues: string };
    expect(cj.antes).toBe("Efectivo");
    expect(cj.despues).toBe("QR");

    const dup = (await postCorreccion({
      request: req("http://x/api/sales/medium-corrections", key, { sale_id, medio_nuevo: "QR", motivo: "cliente pide QR", actor: "dueno-1" }),
    } as never)) as Response;
    expect(dup.status).toBe(409);
  });

  it("devolución y corrección sin venta => 404", async () => {
    const d = (await postReturns({
      request: req("http://x/api/returns", `pers2-d-${Date.now()}-x`, devolucionBody(crypto.randomUUID(), 100)),
    } as never)) as Response;
    expect(d.status).toBe(404);
    const c = (await postCorreccion({
      request: req("http://x/api/sales/medium-corrections", `pers2-c-${Date.now()}-x`, {
        sale_id: crypto.randomUUID(),
        medio_nuevo: "QR",
        motivo: "cliente pide QR",
        actor: "dueno-1",
      }),
    } as never)) as Response;
    expect(c.status).toBe(404);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const ventaPG = crypto.randomUUID();
const ventaCorrPG = crypto.randomUUID();

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function sembrarVenta(tenant: "tenant-a" | "tenant-b", saleId: string) {
  await conTenant(tenant, async () => {
    const db = getTenantDb();
    await db
      .insert(sales)
      .values({ id: saleId, idempotencyKey: `sem-${sufijoPG}-${saleId.slice(0, 8)}`, medio: "Efectivo", totalCentavos: 15000n, clientOccurredAt: new Date() })
      .onConflictDoNothing();
  });
}

async function borrarRastroPG() {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      await db.delete(ticketPaymentCorrections).where(eq(ticketPaymentCorrections.saleId, ventaCorrPG));
      await db.delete(saleReturns).where(eq(saleReturns.saleId, ventaPG));
      await db.delete(sales).where(eq(sales.id, ventaCorrPG));
      await db.delete(sales).where(eq(sales.id, ventaPG));
    });
  }
}

describe.skipIf(!hayPG)("PERS2-S25/S26 multi con PG local: devolución y corrección aisladas por tenant", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("una devolución en A queda en sale_returns de A y no en B", async () => {
    fijarMulti();
    await sembrarVenta("tenant-a", ventaPG);
    const key = `pers2-pg-dev-${sufijoPG}`;
    const r = await conTenant("tenant-a", () =>
      postReturns({ request: req("http://x/api/returns", key, devolucionBody(ventaPG, 5000)) } as never),
    );
    expect((r as Response).status).toBe(201);
    const j = ((await (r as Response).json()) as { fiscal_estado: string; numero_devolucion: string });
    expect(j.fiscal_estado).toBe("sin_factura");
    expect(j.numero_devolucion).toBe("D-000001");

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(saleReturns).where(eq(saleReturns.idempotencyKey, key));
    });
    expect(filasA.length).toBe(1);
    expect(filasA[0]?.saleId).toBe(ventaPG);

    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(saleReturns).where(eq(saleReturns.idempotencyKey, key));
    });
    expect(filasB.length).toBe(0);
  });

  it("la misma key de devolución en B no choca (vistos aislados) y cada base tiene su fila", async () => {
    fijarMulti();
    await sembrarVenta("tenant-b", ventaPG);
    const key = `pers2-pg-dev-${sufijoPG}`;
    const r = await conTenant("tenant-b", () =>
      postReturns({ request: req("http://x/api/returns", key, devolucionBody(ventaPG, 5000)) } as never),
    );
    expect((r as Response).status).toBe(201);
    for (const t of ["tenant-a", "tenant-b"] as const) {
      const filas = await conTenant(t, async () => getTenantDb().select().from(saleReturns).where(eq(saleReturns.idempotencyKey, key)));
      expect(filas.length).toBe(1);
    }
  });

  it("una corrección de medio en A no es visible en B", async () => {
    fijarMulti();
    await sembrarVenta("tenant-a", ventaCorrPG);
    await sembrarVenta("tenant-b", ventaCorrPG);
    const key = `pers2-pg-corr-${sufijoPG}`;
    const cuerpo = { sale_id: ventaCorrPG, medio_nuevo: "QR", motivo: "cliente pide QR", actor: "dueno-1" };
    const r = await conTenant("tenant-a", () =>
      postCorreccion({ request: req("http://x/api/sales/medium-corrections", key, cuerpo) } as never),
    );
    expect((r as Response).status).toBe(201);

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(ticketPaymentCorrections).where(eq(ticketPaymentCorrections.idempotencyKey, key));
    });
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(ticketPaymentCorrections).where(eq(ticketPaymentCorrections.idempotencyKey, key));
    });
    expect(filasB.length).toBe(0);

    const enB = await conTenant("tenant-b", () =>
      postCorreccion({ request: req("http://x/api/sales/medium-corrections", key, cuerpo) } as never),
    );
    expect((enB as Response).status).toBe(201);
  });
});
