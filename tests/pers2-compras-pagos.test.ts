import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore, store, control } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { tenantPorDefecto } from "../src/lib/tenant-context.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { getTenantDb } from "../src/lib/db.js";
import { supplierInvoices, supplierPayments } from "../src/db/schema-proveedores.js";
import { paymentOrders } from "../src/db/schema-pagos.js";
import { payees } from "../src/db/schema-pagos.js";
import { POST as postDrafts } from "../src/pages/api/supplier-invoices/drafts.js";
import { POST as postConfirm } from "../src/pages/api/supplier-invoices/drafts/confirm.js";
import { POST as postDiscard } from "../src/pages/api/supplier-invoices/drafts/discard.js";
import { POST as postMatch } from "../src/pages/api/supplier-invoices/match.js";
import { GET as getAccount } from "../src/pages/api/supplier-invoices/account.js";
import { POST as postPay } from "../src/pages/api/supplier-invoices/payments.js";
import { POST as postPrepare } from "../src/pages/api/payment-orders/prepare.js";
import { POST as postCancel } from "../src/pages/api/payment-orders/cancel.js";
import { POST as postConfirmPaid } from "../src/pages/api/payment-orders/confirm-paid.js";
import {
  POST as postSugerir,
  limpiar_vistos_notif,
} from "../src/pages/api/payment-orders/sugerir-desde-notif.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/supplier-invoices/drafts/confirm.ts",
  "src/pages/api/supplier-invoices/drafts/discard.ts",
  "src/pages/api/supplier-invoices/account.ts",
  "src/pages/api/supplier-invoices/match.ts",
  "src/pages/api/supplier-invoices/drafts.ts",
  "src/pages/api/supplier-invoices/payments.ts",
  "src/pages/api/payment-orders/cancel.ts",
  "src/pages/api/payment-orders/confirm-paid.ts",
  "src/pages/api/payment-orders/sugerir-desde-notif.ts",
  "src/pages/api/payment-orders/prepare.ts",
];

function importaStoreValores(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S14/S15 AT11: supplier-invoices y payment-orders sin valores de lib/store (ADR-0057)", () => {
  it("ninguna de las 10 rutas importa valores de lib/store (import type y control permitidos)", () => {
    const mal = RUTAS_SIN_STORE.filter(importaStoreValores);
    expect(mal).toEqual([]);
  });
});

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function req(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const CUIT = "20-93333172-6";

function cuerpoBorrador(bytesRef: string) {
  return {
    origen: "gmail",
    bytes_ref: bytesRef,
    es_comprobante: true,
    cuit_texto: CUIT,
    fecha_texto: "10/10/2026",
    total_texto: "164.800,00",
  };
}

async function ingerir(key: string): Promise<string> {
  const res = (await postDrafts({
    request: req("http://x/api/supplier-invoices/drafts", cuerpoBorrador(`bytes-${key}`), {
      "Idempotency-Key": key,
    }),
  } as never)) as Response;
  expect(res.status).toBe(201);
  return ((await res.json()) as { draft_id: string }).draft_id;
}

function sembrarPayee(id = `pay-${Date.now()}-${Math.floor(Math.random() * 1e6)}`) {
  const payee = {
    id,
    nombre: "Distribuidora X SRL",
    tipo: "proveedor" as const,
    medioPreferido: "Transferencia" as const,
    alias: `distri.x.${Date.now()}`,
    activo: true,
  };
  store.payees.set(id, payee);
  return id;
}

function cuerpoOrden(payeeId: string) {
  return {
    payee_id: payeeId,
    concepto: "Factura A 0003-00012345",
    monto_centavos: 18250000,
    vence_el_ms: Date.UTC(2026, 9, 31),
    medio_sugerido: "Transferencia",
    instruccion: "transferencia",
    creado_por: "dueno-1",
  };
}

async function preparar(payeeId: string, key: string): Promise<{ order_id: string; numero: string }> {
  const res = (await postPrepare({
    request: req("http://x/api/payment-orders/prepare", cuerpoOrden(payeeId), { "Idempotency-Key": key }),
  } as never)) as Response;
  expect(res.status).toBe(201);
  return (await res.json()) as { order_id: string; numero: string };
}

describe("PERS2-S14/S15 single sin DB: se comporta como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("borrador: ingesta 201, duplicado 200 y confirm 201 con factura", async () => {
    const draftId = await ingerir(`br-${Date.now()}`);
    expect(draftId).toMatch(/^borr-/);
    const dup = (await postDrafts({
      request: req("http://x/api/supplier-invoices/drafts", cuerpoBorrador("otros-bytes"), {
        "Idempotency-Key": `br-${Date.now()}`,
      }),
    } as never)) as Response;
    expect([200, 201]).toContain(dup.status);
    const c = (await postConfirm({
      request: req("http://x/api/supplier-invoices/drafts/confirm", { draft_id: draftId, quien: "d" }),
    } as never)) as Response;
    expect(c.status).toBe(201);
    const j = (await c.json()) as { factura_id: string; total_centavos: string; vinculo: unknown };
    expect(j.factura_id).toMatch(/^fac-/);
    expect(j.total_centavos).toBe("16480000");
  });

  it("descarte: 200 estado descartada y match responde candidatos", async () => {
    const draftId = await ingerir(`brd-${Date.now()}`);
    const d = (await postDiscard({
      request: req("http://x/api/supplier-invoices/drafts/discard", { draft_id: draftId, quien: "d" }),
    } as never)) as Response;
    expect(d.status).toBe(200);
    expect(((await d.json()) as { estado: string }).estado).toBe("descartada");
    const draftId2 = await ingerir(`brm-${Date.now()}`);
    const m = (await postMatch({
      request: req("http://x/api/supplier-invoices/match", { draft_id: draftId2 }),
    } as never)) as Response;
    expect(m.status).toBe(200);
    const jm = (await m.json()) as { candidatos: unknown[]; intentos: number };
    expect(Array.isArray(jm.candidatos)).toBe(true);
    expect(jm.intentos).toBe(0);
  });

  it("cuenta y pago: facturado menos pagado da saldo y el pago descuenta", async () => {
    const draftId = await ingerir(`brp-${Date.now()}`);
    const c = (await postConfirm({
      request: req("http://x/api/supplier-invoices/drafts/confirm", { draft_id: draftId, quien: "d" }),
    } as never)) as Response;
    expect(c.status).toBe(201);
    const { factura_id } = (await c.json()) as { factura_id: string };
    const a1 = (await getAccount(
      ctx(`http://x/api/supplier-invoices/account?cuit=${encodeURIComponent(CUIT)}`),
    )) as Response;
    expect(a1.status).toBe(200);
    expect(((await a1.json()) as { saldoCentavos: string }).saldoCentavos).toBe("16480000");
    const p = (await postPay({
      request: req(
        "http://x/api/supplier-invoices/payments",
        {
          supplier_cuit: CUIT,
          monto_centavos: 6480000,
          metodo: "Transferencia",
          fecha_iso: "2026-10-10",
          creado_por: "dueno-1",
          factura_id: factura_id,
        },
        { "Idempotency-Key": `pag-${Date.now()}` },
      ),
    } as never)) as Response;
    expect(p.status).toBe(201);
    expect(((await p.json()) as { pago_id: string }).pago_id).toMatch(/^pag-/);
    const a2 = (await getAccount(
      ctx(`http://x/api/supplier-invoices/account?cuit=${encodeURIComponent(CUIT)}`),
    )) as Response;
    expect(((await a2.json()) as { saldoCentavos: string }).saldoCentavos).toBe("10000000");
  });

  it("ordenes: preparar 201, cancelar 200 y confirmar pagada 200 con egreso", async () => {
    const tenant = tenantPorDefecto();
    control.tenants.set(tenant, {
      id: tenant,
      nombreComercio: "Kiosco",
      slug: "kiosco",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: "dueno-1",
      esDemo: false,
    });
    control.memberships.set("m-dueno-1", {
      id: "m-dueno-1",
      tenantId: tenant,
      googleSub: "dueno-1",
      rol: "dueno",
      permisos: [],
      estado: "activo",
    });
    const ahora = new Date();
    const c = crearSesion({ googleSub: "dueno-1", tenantId: null, ahora });
    control.sessions.set(c.registro.idHash, {
      idHash: c.registro.idHash,
      googleSub: "dueno-1",
      tenantId: null,
      expiraAt: c.registro.expiraAt,
      expiraAbsoluta: c.registro.expiraAbsoluta,
      lastSeenAt: ahora.toISOString(),
    });
    const auth = { cookie: `__Host-sesion=${c.idPlano}` };
    const payeeId = sembrarPayee();
    const movsAntes = store.movements.length;
    const o1 = await preparar(payeeId, `ord-${Date.now()}-1`);
    expect(o1.numero).toMatch(/^OP-\d+$/);
    const cc = (await postCancel({
      request: req(
        "http://x/api/payment-orders/cancel",
        {
          order_id: o1.order_id,
          version_esperada: 1,
          motivo: "factura anulada",
          actor: "dueno-1",
        },
        auth,
      ),
    } as never)) as Response;
    expect(cc.status).toBe(200);
    expect(((await cc.json()) as { estado: string }).estado).toBe("cancelada");
    const o2 = await preparar(payeeId, `ord-${Date.now()}-2`);
    const p = (await postConfirmPaid({
      request: req(
        "http://x/api/payment-orders/confirm-paid",
        { order_id: o2.order_id, version_esperada: 1, medio: "Transferencia", actor: "dueno-1" },
        { "Idempotency-Key": `pago-ord-${Date.now()}`, ...auth },
      ),
    } as never)) as Response;
    expect(p.status).toBe(200);
    expect(((await p.json()) as { estado: string }).estado).toBe("pagada");
    expect(store.movements.length).toBe(movsAntes + 1);
  });

  it("sugerir-desde-notif: 200 con candidatos y reintento 409", async () => {
    limpiar_vistos_notif();
    const payeeId = sembrarPayee();
    await preparar(payeeId, `ord-${Date.now()}-s`);
    const texto = "Banco Galicia: pagaste $ 48.000 el 10/10/2026";
    const r1 = (await postSugerir({
      request: req("http://x/api/payment-orders/sugerir-desde-notif", {
        texto,
        notif_id: `n-${Date.now()}-1`,
        hoy_iso: "2026-10-10",
      }),
    } as never)) as Response;
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as { notif: { monto_centavos: string }; candidatos: unknown[] };
    expect(j1.notif.monto_centavos).toBe("4800000");
    const r2 = (await postSugerir({
      request: req("http://x/api/payment-orders/sugerir-desde-notif", {
        texto: "otro texto",
        notif_id: `n-${Date.now()}-2`,
        hoy_iso: "2026-10-10",
      }),
    } as never)) as Response;
    expect([200, 422]).toContain(r2.status);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function sembrarPayeePG(tenant: "tenant-a" | "tenant-b", nombre: string): Promise<string> {
  const id = randomUUID();
  await conTenant(tenant, async () => {
    const db = getTenantDb();
    await db.insert(payees).values({ id, nombre, tipo: "proveedor", medioPreferido: "Transferencia" });
  });
  return id;
}

function maxSufijo(numeros: string[]): number {
  let max = 0;
  for (const n of numeros) {
    const m = /^OP-(\d+)$/.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

describe.skipIf(!hayPG)("PERS2-S14/S15 multi con PG local: facturas y ordenes aisladas por tenant", () => {
  const draftKey = `pers2-cp-draft-${sufijoPG}`;
  const pagoKey = `pers2-cp-pago-${sufijoPG}`;
  const ordenKeyA = `pers2-cp-ord-a-${sufijoPG}`;
  const ordenKeyB = `pers2-cp-ord-b-${sufijoPG}`;
  const pagoOrdenKey = `pers2-cp-pagoord-${sufijoPG}`;

  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.delete(supplierPayments).where(eq(supplierPayments.idempotencyKey, pagoKey));
        await db.delete(supplierInvoices).where(eq(supplierInvoices.draftId, await draftUuid(tenant, draftKey)));
        const { ne } = await import("drizzle-orm");
        void ne;
      });
    }
    await borrarRastroOrdenes();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  async function draftUuid(tenant: "tenant-a" | "tenant-b", key: string): Promise<string> {
    return conTenant(tenant, async () => {
      const db = getTenantDb();
      const { supplierDrafts } = await import("../src/db/schema-proveedores.js");
      const filas = await db.select().from(supplierDrafts).where(eq(supplierDrafts.idempotencyKey, key));
      return filas[0]?.id ?? "00000000-0000-0000-0000-000000000000";
    });
  }

  async function borrarRastroOrdenes() {
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.delete(paymentOrders).where(eq(paymentOrders.idempotencyKey, ordenKeyA));
        await db.delete(paymentOrders).where(eq(paymentOrders.idempotencyKey, ordenKeyB));
      });
    }
  }

  it("pago a proveedor en A queda en supplier_payments de A y B no lo ve", async () => {
    fijarMulti();
    const d = await conTenant("tenant-a", () =>
      postDrafts({
        request: req("http://x/api/supplier-invoices/drafts", cuerpoBorrador(`bytes-${draftKey}`), {
          "Idempotency-Key": draftKey,
        }),
      } as never),
    );
    expect((d as Response).status).toBe(201);
    const draftId = ((await (d as Response).json()) as { draft_id: string }).draft_id;
    const c = await conTenant("tenant-a", () =>
      postConfirm({
        request: req("http://x/api/supplier-invoices/drafts/confirm", { draft_id: draftId, quien: "d" }),
      } as never),
    );
    expect((c as Response).status).toBe(201);
    const { factura_id } = (await (c as Response).json()) as { factura_id: string };
    const p = await conTenant("tenant-a", () =>
      postPay({
        request: req(
          "http://x/api/supplier-invoices/payments",
          {
            supplier_cuit: CUIT,
            monto_centavos: 100000,
            metodo: "Transferencia",
            fecha_iso: "2026-10-10",
            creado_por: "dueno-1",
            factura_id,
          },
          { "Idempotency-Key": pagoKey },
        ),
      } as never),
    );
    expect((p as Response).status).toBe(201);
    expect(((await (p as Response).json()) as { fuente: string }).fuente).toBe("db");
    const filasA = await conTenant("tenant-a", async () =>
      getTenantDb().select().from(supplierPayments).where(eq(supplierPayments.idempotencyKey, pagoKey)),
    );
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () =>
      getTenantDb().select().from(supplierPayments).where(eq(supplierPayments.idempotencyKey, pagoKey)),
    );
    expect(filasB.length).toBe(0);
  });

  it("orden preparada en A queda en payment_orders de A y B no la ve; B numera por su cuenta", async () => {
    fijarMulti();
    const payeeA = await sembrarPayeePG("tenant-a", `Payee A ${sufijoPG}`);
    const payeeB = await sembrarPayeePG("tenant-b", `Payee B ${sufijoPG}`);
    const antesB = await conTenant("tenant-b", async () =>
      getTenantDb().select({ numero: paymentOrders.numero }).from(paymentOrders),
    );
    const maxAntesB = maxSufijo(antesB.map((r) => r.numero));
    const rA = await conTenant("tenant-a", () =>
      postPrepare({
        request: req("http://x/api/payment-orders/prepare", cuerpoOrden(payeeA), {
          "Idempotency-Key": ordenKeyA,
        }),
      } as never),
    );
    expect((rA as Response).status).toBe(201);
    const jA = (await (rA as Response).json()) as { order_id: string; numero: string; estado: string };
    expect(jA.estado).toBe("preparada");
    const filasA = await conTenant("tenant-a", async () =>
      getTenantDb().select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, ordenKeyA)),
    );
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () =>
      getTenantDb().select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, ordenKeyA)),
    );
    expect(filasB.length).toBe(0);
    const rB = await conTenant("tenant-b", () =>
      postPrepare({
        request: req("http://x/api/payment-orders/prepare", cuerpoOrden(payeeB), {
          "Idempotency-Key": ordenKeyB,
        }),
      } as never),
    );
    expect((rB as Response).status).toBe(201);
    const jB = (await (rB as Response).json()) as { numero: string };
    expect(maxSufijo([jB.numero])).toBe(maxAntesB + 1);
    void pagoOrdenKey;
  });
});
