import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant, tenantPorDefecto } from "../src/lib/tenant-mode.js";
import { tenantDeRequest } from "../src/lib/tenant-context.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { idMappings, outbox, products, sales, ticketCounters, tickets } from "../src/db/schema.js";
import { POST as postPrepare } from "../src/pages/api/payment-orders/prepare.js";
import { POST as postCancel } from "../src/pages/api/payment-orders/cancel.js";
import { POST as postConfirmPaid } from "../src/pages/api/payment-orders/confirm-paid.js";
import { POST as postFiscal, GET as getFiscal } from "../src/pages/api/fiscal/settings.js";
import { POST as postAdjust } from "../src/pages/api/prices/adjustments.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { POST as postPush } from "../src/pages/api/sync/push.js";
import { POST as postPromote } from "../src/pages/api/sync/promote.js";

const TENANT = tenantPorDefecto();
const DUENO = "sec-dueno";
const EMPLEADO = "sec-empleado";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function sembrarTenant(id = TENANT, dueno = DUENO) {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco SEC",
    slug: `kiosco-sec-${id}`,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: false,
  });
  control.memberships.set(`m-${id}-${dueno}`, {
    id: `m-${id}-${dueno}`,
    tenantId: id,
    googleSub: dueno,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
}

function sembrarEmpleado(id = TENANT, sub = EMPLEADO) {
  control.memberships.set(`m-${id}-${sub}`, {
    id: `m-${id}-${sub}`,
    tenantId: id,
    googleSub: sub,
    rol: "empleado",
    permisos: [],
    estado: "activo",
  });
}

function sesion(sub: string, tenantId: string | null, reauthAt?: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: reauthAt ?? ahora.toISOString(),
  });
  return c.idPlano;
}

function reauthVieja(): string {
  return new Date(Date.now() - 20 * 60_000).toISOString();
}

function reqJson(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function sembrarPayee() {
  const id = `sec-pay-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  store.payees.set(id, {
    id,
    nombre: "Distribuidora SEC",
    tipo: "proveedor",
    medioPreferido: "Transferencia",
    alias: `sec.${Date.now()}`,
    activo: true,
  });
  return id;
}

function cuerpoOrden(payeeId: string) {
  return {
    payee_id: payeeId,
    concepto: "Factura SEC 0001",
    monto_centavos: 100000,
    vence_el_ms: Date.UTC(2026, 11, 31),
    medio_sugerido: "Transferencia",
    instruccion: "transferencia",
    creado_por: DUENO,
  };
}

async function prepararOrden(payeeId: string, key: string): Promise<string> {
  const r = (await postPrepare({
    request: reqJson("http://x/api/payment-orders/prepare", cuerpoOrden(payeeId), { "Idempotency-Key": key }),
  } as never)) as Response;
  expect(r.status).toBe(201);
  return ((await r.json()) as { order_id: string }).order_id;
}

const FISCAL_OK = {
  cuit: "20-93333172-6",
  razon_social: "Kiosco SEC",
  domicilio: "Calle 1",
  condicion_iva: "responsable_inscripto",
  inicio_actividades: "2020-01-01",
  pto_vta: "3",
};

const AJUSTE = {
  direccion: "suba",
  porcentaje: 10,
  vigencia_tipo: "ahora",
  aplica_en: null,
  confirmado: true,
  creado_por: DUENO,
  tenant_id: TENANT,
  items: [{ sku: "demo-sku-1", vigente_centavos: 15000 }],
};

beforeEach(() => {
  modoSingleSinDb();
  resetStore();
  sembrarTenant();
});

describe("SEC-S1 payment-orders exige dueño real", () => {
  it("confirm-paid sin sesión da 403", async () => {
    const orderId = await prepararOrden(sembrarPayee(), `sec-prep-${Date.now()}-1`);
    const r = (await postConfirmPaid({
      request: reqJson(
        "http://x/api/payment-orders/confirm-paid",
        { order_id: orderId, version_esperada: 1, medio: "Transferencia", actor: DUENO },
        { "Idempotency-Key": `sec-cp-${Date.now()}-1` },
      ),
    } as never)) as Response;
    expect(r.status).toBe(403);
  });

  it("confirm-paid como empleado da 403", async () => {
    sembrarEmpleado();
    const orderId = await prepararOrden(sembrarPayee(), `sec-prep-${Date.now()}-2`);
    const plano = sesion(EMPLEADO, TENANT);
    const r = (await postConfirmPaid({
      request: reqJson(
        "http://x/api/payment-orders/confirm-paid",
        { order_id: orderId, version_esperada: 1, medio: "Transferencia", actor: EMPLEADO },
        { "Idempotency-Key": `sec-cp-${Date.now()}-2`, cookie: `__Host-sesion=${plano}` },
      ),
    } as never)) as Response;
    expect(r.status).toBe(403);
  });

  it("confirm-paid como dueño da 200", async () => {
    const orderId = await prepararOrden(sembrarPayee(), `sec-prep-${Date.now()}-3`);
    const plano = sesion(DUENO, TENANT);
    const r = (await postConfirmPaid({
      request: reqJson(
        "http://x/api/payment-orders/confirm-paid",
        { order_id: orderId, version_esperada: 1, medio: "Transferencia", actor: DUENO },
        { "Idempotency-Key": `sec-cp-${Date.now()}-3`, cookie: `__Host-sesion=${plano}` },
      ),
    } as never)) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { estado: string }).estado).toBe("pagada");
  });

  it("cancel sin sesión da 403", async () => {
    const orderId = await prepararOrden(sembrarPayee(), `sec-prep-${Date.now()}-4`);
    const r = (await postCancel({
      request: reqJson("http://x/api/payment-orders/cancel", {
        order_id: orderId,
        version_esperada: 1,
        motivo: "no va",
        actor: DUENO,
      }),
    } as never)) as Response;
    expect(r.status).toBe(403);
  });

  it("cancel como empleado da 403", async () => {
    sembrarEmpleado();
    const orderId = await prepararOrden(sembrarPayee(), `sec-prep-${Date.now()}-5`);
    const plano = sesion(EMPLEADO, TENANT);
    const r = (await postCancel({
      request: reqJson(
        "http://x/api/payment-orders/cancel",
        { order_id: orderId, version_esperada: 1, motivo: "no va", actor: EMPLEADO },
        { cookie: `__Host-sesion=${plano}` },
      ),
    } as never)) as Response;
    expect(r.status).toBe(403);
  });

  it("cancel como dueño da 200", async () => {
    const orderId = await prepararOrden(sembrarPayee(), `sec-prep-${Date.now()}-6`);
    const plano = sesion(DUENO, TENANT);
    const r = (await postCancel({
      request: reqJson(
        "http://x/api/payment-orders/cancel",
        { order_id: orderId, version_esperada: 1, motivo: "no va", actor: DUENO },
        { cookie: `__Host-sesion=${plano}` },
      ),
    } as never)) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { estado: string }).estado).toBe("cancelada");
  });
});

describe("SEC-S2 fiscal/settings exige dueño + reauth + tenant resuelto", () => {
  it("POST sin sesión da 403", async () => {
    const r = (await postFiscal({ request: reqJson("http://x/api/fiscal/settings", FISCAL_OK) } as never)) as Response;
    expect(r.status).toBe(403);
  });

  it("POST dueño con reauth vieja da 401 reauth_requerida", async () => {
    const plano = sesion(DUENO, TENANT, reauthVieja());
    const r = (await postFiscal({
      request: reqJson("http://x/api/fiscal/settings", FISCAL_OK, { cookie: `__Host-sesion=${plano}` }),
    } as never)) as Response;
    expect(r.status).toBe(401);
    expect(JSON.stringify(await r.json())).toContain("reauth_requerida");
  });

  it("POST multi sin membership da 403", async () => {
    const modoPrevio = process.env.TENANT_MODE;
    process.env.TENANT_MODE = "multi";
    try {
      const plano = sesion("nadie", "tenant-fantasma");
      const r = (await postFiscal({
        request: reqJson("http://x/api/fiscal/settings", FISCAL_OK, { cookie: `__Host-sesion=${plano}` }),
      } as never)) as Response;
      expect(r.status).toBe(403);
    } finally {
      if (modoPrevio === undefined) delete process.env.TENANT_MODE;
      else process.env.TENANT_MODE = modoPrevio;
    }
  });

  it("POST dueño fresco da 201 con el tenant resuelto aunque x-tenant-id diga otro", async () => {
    const plano = sesion(DUENO, TENANT);
    const r = (await postFiscal({
      request: reqJson("http://x/api/fiscal/settings", FISCAL_OK, {
        cookie: `__Host-sesion=${plano}`,
        "x-tenant-id": "otro-comercio",
      }),
    } as never)) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { tenant_id: string }).tenant_id).toBe(TENANT);
  });

  it("GET sin sesión da 403 y con dueño ignora ?tenant_id", async () => {
    const anon = (await getFiscal({
      request: new Request("http://x/api/fiscal/settings"),
      url: new URL("http://x/api/fiscal/settings?tenant_id=otro"),
    } as never)) as Response;
    expect(anon.status).toBe(403);
    const plano = sesion(DUENO, TENANT);
    await postFiscal({
      request: reqJson("http://x/api/fiscal/settings", FISCAL_OK, { cookie: `__Host-sesion=${plano}` }),
    } as never);
    const r = (await getFiscal({
      request: new Request("http://x/api/fiscal/settings?tenant_id=otro", {
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
      url: new URL("http://x/api/fiscal/settings?tenant_id=otro"),
    } as never)) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { tenant_id: string }).tenant_id).toBe(TENANT);
  });
});

describe("SEC-S3 adjustments exige online real", () => {
  it("con x-offline-grant da 403", async () => {
    const plano = sesion(DUENO, TENANT);
    const r = (await postAdjust({
      request: reqJson("http://x/api/prices/adjustments", AJUSTE, {
        "Idempotency-Key": `sec-aj-${Date.now()}-1`,
        cookie: `__Host-sesion=${plano}`,
        "x-offline-grant": "jwt-falso",
      }),
    } as never)) as Response;
    expect(r.status).toBe(403);
  });

  it("con x-cuarentena:1 da 403", async () => {
    const plano = sesion(DUENO, TENANT);
    const r = (await postAdjust({
      request: reqJson("http://x/api/prices/adjustments", AJUSTE, {
        "Idempotency-Key": `sec-aj-${Date.now()}-2`,
        cookie: `__Host-sesion=${plano}`,
        "x-cuarentena": "1",
      }),
    } as never)) as Response;
    expect(r.status).toBe(403);
  });

  it("online como dueño da 201", async () => {
    const plano = sesion(DUENO, TENANT);
    const r = (await postAdjust({
      request: reqJson("http://x/api/prices/adjustments", AJUSTE, {
        "Idempotency-Key": `sec-aj-${Date.now()}-3`,
        cookie: `__Host-sesion=${plano}`,
      }),
    } as never)) as Response;
    expect(r.status).toBe(201);
  });
});

function ventaBody(seq: number, over: Record<string, unknown> = {}) {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: seq,
    client_occurred_at: new Date().toISOString(),
    offline: false,
    ...over,
  };
}

function pushReq(opId: string, seq: number, device: string): Request {
  return new Request("http://localhost/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": opId },
    body: JSON.stringify({
      op_id: opId,
      device_code: device,
      device_seq: seq,
      hlc: `${Date.now()}:${seq}`,
      modulo: "sales",
      payload: { total: 15000 },
      client_occurred_at: new Date().toISOString(),
    }),
  });
}

function promoteReq(opId: string, seq: number, device: string): Request {
  return new Request("http://localhost/api/sync/promote", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": opId },
    body: JSON.stringify({ op_id: opId, device_code: device, device_seq: seq }),
  });
}

async function vender(key: string, seq: number): Promise<string> {
  const r = (await postSales({
    request: new Request("http://x/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(ventaBody(seq)),
    }),
  } as never)) as Response;
  expect(r.status).toBe(201);
  return ((await r.json()) as { ticket_definitivo: string }).ticket_definitivo;
}

async function promover(device: string, seq: number): Promise<string> {
  const opId = randomUUID();
  const push = (await postPush({ request: pushReq(opId, seq, device) } as never)) as Response;
  expect(push.status).toBe(201);
  const pr = (await postPromote({ request: promoteReq(opId, seq, device) } as never)) as Response;
  expect(pr.status).toBe(201);
  return ((await pr.json()) as { ticket_definitivo: string }).ticket_definitivo;
}

describe("SEC-S4 correlativo único entre ventas y sync", () => {
  it("memoria: ventas y promotes intercalados no duplican", async () => {
    const numeros: string[] = [];
    numeros.push(await vender(`sec-v-${Date.now()}-1`, 1));
    numeros.push(await promover("caja-sec", 1));
    numeros.push(await vender(`sec-v-${Date.now()}-2`, 2));
    numeros.push(await promover("caja-sec", 2));
    numeros.push(await vender(`sec-v-${Date.now()}-3`, 3));
    expect(numeros.every((n) => /^T-\d{6}$/.test(n))).toBe(true);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("tenantDeRequest en single resuelve el tenant por defecto sin sesión", () => {
    const r = tenantDeRequest(new Request("http://x/api/sales"));
    expect(r.ok).toBe(true);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `sec-${Date.now().toString(36)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("SEC-S4 PG: ventas y promote comparten ticket_counters", () => {
  const sku = `sec-sku-${sufijoPG}`;
  const ventaKey = `sec-pg-v-${sufijoPG}`;
  const opId = randomUUID();
  const device = `caja-sec-${sufijoPG}`.slice(0, 32);
  let ultimoPrevio = 0;

  beforeAll(async () => {
    fijarMulti();
    resetStore();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.execute(
        sql`insert into products (sku, nombre, precio_centavos, stock_actual) values (${sku}, 'SEC PG', 15000, 10) on conflict (sku) do nothing`,
      );
      await db.insert(ticketCounters).values({ id: "mostrador", ultimo: 0 }).onConflictDoNothing();
      const filas = await db.select().from(ticketCounters).where(eq(ticketCounters.id, "mostrador")).limit(1);
      ultimoPrevio = filas[0]?.ultimo ?? 0;
      await db.update(ticketCounters).set({ ultimo: 0 }).where(eq(ticketCounters.id, "mostrador"));
    });
    await conTenant("tenant-a", () => {
      store.nextTicket = 1;
    });
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const filas = await db.select().from(sales).where(eq(sales.idempotencyKey, ventaKey));
      for (const f of filas) {
        await db.delete(tickets).where(eq(tickets.saleId, f.id));
      }
      await db.delete(sales).where(eq(sales.idempotencyKey, ventaKey));
      await db.delete(outbox).where(eq(outbox.opId, opId));
      await db.delete(idMappings).where(eq(idMappings.opId, opId));
      await db.delete(products).where(eq(products.sku, sku));
      await db.update(ticketCounters).set({ ultimo: ultimoPrevio }).where(eq(ticketCounters.id, "mostrador"));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("una venta y un promote no repiten número y el promote sigue al contador", async () => {
    fijarMulti();
    const v = await conTenant("tenant-a", () =>
      postSales({
        request: new Request("http://x/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": ventaKey },
          body: JSON.stringify(ventaBody(11, { lineas: [{ product_id: sku, qty: 1, precio_centavos: 15000 }] })),
        }),
      } as never),
    );
    expect((v as Response).status).toBe(201);
    const ticketVenta = ((await (v as Response).json()) as { ticket_definitivo: string }).ticket_definitivo;
    expect(ticketVenta).toBe("T-000001");

    const push = await conTenant("tenant-a", () => postPush({ request: pushReq(opId, 1, device) } as never));
    expect((push as Response).status).toBe(201);
    const pr = await conTenant("tenant-a", () => postPromote({ request: promoteReq(opId, 1, device) } as never));
    expect((pr as Response).status).toBe(201);
    const ticketSync = ((await (pr as Response).json()) as { ticket_definitivo: string }).ticket_definitivo;
    expect(ticketSync).toBe("T-000002");
    expect(new Set([ticketVenta, ticketSync]).size).toBe(2);
  });
});
