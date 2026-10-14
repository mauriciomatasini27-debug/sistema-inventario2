import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, sales, tickets } from "../src/db/schema.js";
import { ticketLinks, ticketLinkRevocations } from "../src/db/schema-tickets.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { GET as getTickets } from "../src/pages/api/tickets.js";
import { POST as postLink, GET as getLink, DELETE as deleteLink } from "../src/pages/api/tickets/link.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/tickets.ts",
  "src/pages/api/tickets/compartir.ts",
  "src/pages/api/tickets/link.ts",
];

describe("PERS2-S5 AT7a: rutas de tickets sin lib/store (ADR-0053)", () => {
  it("ninguna de las 3 rutas importa lib/store", () => {
    const mal = RUTAS_SIN_STORE.filter((f) => /lib\/store/.test(readFileSync(f, "utf8")));
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

function req(url: string, key: string | null, body: unknown, method = "POST") {
  const headers: Record<string, string> = {};
  if (key) headers["Idempotency-Key"] = key;
  return ctx(url, { method, body: body as Record<string, unknown>, headers });
}

async function crearVenta(key: string) {
  const r = await postSales(req("http://x/api/sales", key, ventaBody()));
  expect(r.status).toBe(201);
  return (await r.json()) as { sale_id: string; ticket_definitivo: string; ticket_provisorio: string };
}

describe("PERS2-S5 single sin DB: links se crean y revocan como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("GET /api/tickets resuelve por definitivo y 404 el ausente", async () => {
    const v = await crearVenta(`pers2-t-${Date.now()}-a`);
    const porDef = await getTickets(ctx(`http://x/api/tickets?numero=${v.ticket_definitivo}`));
    expect(porDef.status).toBe(200);
    const cuerpo = (await porDef.json()) as { sale_id: string; fuente: string; leyenda: string };
    expect(cuerpo.sale_id).toBe(v.sale_id);
    expect(cuerpo.fuente).toBe("memoria");
    expect(cuerpo.leyenda).toBe("DOCUMENTO NO VÁLIDO COMO FACTURA");

    const ausente = await getTickets(ctx("http://x/api/tickets?numero=T-999999"));
    expect(ausente.status).toBe(404);
  });

  it("POST link => 201 con token; GET token => 200; DELETE revoca => 200; GET revocado => 410", async () => {
    const { sale_id } = await crearVenta(`pers2-t-${Date.now()}-b`);
    const ck = `pers2-lk-${Date.now()}`;
    const creado = await postLink(req("http://x/api/tickets/link", ck, { sale_id }));
    expect(creado.status).toBe(201);
    const { token, url } = (await creado.json()) as { token: string; url: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(url).toContain(token);

    const ok = await getLink(ctx(`http://x/api/tickets/link?token=${token}`));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { sale_id: string }).sale_id).toBe(sale_id);

    const rk = `pers2-rev-${Date.now()}`;
    const rev = await deleteLink(req("http://x/api/tickets/link", rk, { sale_id, actor: "dueno", motivo: "perdido" }, "DELETE"));
    expect(rev.status).toBe(200);
    expect(((await rev.json()) as { revocadas: number }).revocadas).toBeGreaterThanOrEqual(1);

    const revocado = await getLink(ctx(`http://x/api/tickets/link?token=${token}`));
    expect(revocado.status).toBe(410);

    const retry = await deleteLink(req("http://x/api/tickets/link", rk, { sale_id, actor: "dueno", motivo: "perdido" }, "DELETE"));
    expect(retry.status).toBe(409);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const skuPG = `pers2-tk-${sufijoPG}`;
const devicePG = `pg-tk-${sufijoPG}`;
const ventasPG: string[] = [];

function ventaBodyPG() {
  return ventaBody({ lineas: [{ product_id: skuPG, qty: 1, precio_centavos: 15000 }], device_code: devicePG });
}

async function sembrarProductoPG() {
  await conTenant("tenant-a", async () => {
    const db = getTenantDb();
    // Sin la columna sector (deriva schema/migración): insert crudo mínimo.
    await db.execute(
      sql`insert into products (sku, nombre, precio_centavos, stock_actual) values (${skuPG}, 'Pers2 tickets', 15000, 10) on conflict (sku) do nothing`,
    );
  });
}

async function borrarRastroPG() {
  // ticket_links y revocaciones son append-only por trigger: la limpieza de
  // test desactiva los guardias como owner en la base local y los reactiva.
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      await db.execute(sql`alter table ticket_link_revocations disable trigger ticket_link_revocations_no_update`);
      await db.execute(sql`alter table ticket_links disable trigger ticket_links_no_update`);
      try {
        for (const saleId of ventasPG) {
          await db.delete(ticketLinkRevocations).where(eq(ticketLinkRevocations.saleId, saleId));
          await db.delete(ticketLinks).where(eq(ticketLinks.saleId, saleId));
          await db.delete(tickets).where(eq(tickets.saleId, saleId));
          await db.delete(sales).where(eq(sales.id, saleId));
        }
        await db.delete(products).where(eq(products.sku, skuPG));
      } finally {
        await db.execute(sql`alter table ticket_links enable trigger ticket_links_no_update`);
        await db.execute(sql`alter table ticket_link_revocations enable trigger ticket_link_revocations_no_update`);
      }
    });
  }
}

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("PERS2-S5 multi con PG local: link de A aislado de B", () => {
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

  it("el link creado en A no se resuelve en B y la fila vive en ticket_links de A", async () => {
    fijarMulti();
    await sembrarProductoPG();
    const ventaReq = ctx("http://x/api/sales", {
      method: "POST",
      headers: { "Idempotency-Key": `pers2-pg-v-${sufijoPG}` },
      body: ventaBodyPG(),
    });
    const venta = await conTenant("tenant-a", () => postSales(ventaReq));
    expect(venta.status).toBe(201);
    const { sale_id } = (await venta.json()) as { sale_id: string };
    ventasPG.push(sale_id);

    const ck = `pers2-pg-lk-${sufijoPG}`;
    const creado = await conTenant("tenant-a", () =>
      postLink(req("http://x/api/tickets/link", ck, { sale_id })),
    );
    expect(creado.status).toBe(201);
    const { token } = (await creado.json()) as { token: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const hash = createHash("sha256").update(token, "utf8").digest("hex");

    const enB = await conTenant("tenant-b", () =>
      getLink(ctx(`http://x/api/tickets/link?token=${token}`)),
    );
    expect(enB.status).toBe(404);

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(ticketLinks).where(eq(ticketLinks.tokenHash, hash)).limit(1);
    });
    expect(filasA.length).toBe(1);
    expect(filasA[0]?.saleId).toBe(sale_id);

    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(ticketLinks).where(eq(ticketLinks.tokenHash, hash)).limit(1);
    });
    expect(filasB.length).toBe(0);

    const rk = `pers2-pg-rev-${sufijoPG}`;
    const rev = await conTenant("tenant-a", () =>
      deleteLink(req("http://x/api/tickets/link", rk, { sale_id, actor: "dueno", motivo: "corte" }, "DELETE")),
    );
    expect(rev.status).toBe(200);
    expect(((await rev.json()) as { revocadas: number }).revocadas).toBeGreaterThanOrEqual(1);
  });
});
