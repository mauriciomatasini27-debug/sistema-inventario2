import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { control } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import {
  cashMovements,
  idMappings,
  outbox,
  products,
  sales,
  stockMovements,
  ticketLines,
  ticketPayments,
  tickets,
} from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { aplicarVentaOutbox } from "../src/modules/sync/aplicar-venta-outbox.js";
import {
  descartarVentaNoAplicable,
  empujarOperacion,
  listarVentasNoAplicables,
  reintentarVentaNoAplicable,
} from "../src/lib/repos/sync.js";
import { GET as getNoAplicables, POST as postNoAplicables } from "../src/pages/api/sync/no-aplicables.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const AHORA = new Date("2026-10-20T12:00:00.000Z");

// P10-20: la sesión del fixture vence a los 30 días de AHORA; con el reloj
// real el test se rompía solo al día 30. Fijar solo Date deja vivos los timers.
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

function payloadVenta(seq: number, cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: seq,
    client_occurred_at: new Date().toISOString(),
    ...cambios,
  };
}

function payloadPagosNoSuman(seq: number): Record<string, unknown> {
  return payloadVenta(seq, { pagos: [{ medio: "Efectivo", monto_centavos: 100 }] });
}

function push(opId: string, seq: number, payload: Record<string, unknown>) {
  return empujarOperacion({
    opId,
    deviceCode: "caja-01",
    deviceSeq: seq,
    hlc: `${Date.now()}:${seq}`,
    modulo: "sales",
    payload,
  });
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

function pedirNoAplicables(plano?: string) {
  return getNoAplicables(
    ctx("http://x/api/sync/no-aplicables", plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
  );
}

function enviarNoAplicable(body: Record<string, unknown>, plano?: string) {
  return postNoAplicables(
    ctx("http://x/api/sync/no-aplicables", {
      body,
      ...(plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
    }),
  );
}

describe("P10-7 motivo de una venta no aplicable", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("payload inválido devuelve el motivo payload_invalido", async () => {
    const r = await aplicarVentaOutbox({ opId: crypto.randomUUID(), payload: { lineas: [] } });
    expect(r).toEqual({ resultado: "no_aplicable", motivo: "payload_invalido" });
  });

  it("un rechazo de negocio devuelve el código de registrar_venta", async () => {
    const r = await aplicarVentaOutbox({
      opId: crypto.randomUUID(),
      payload: payloadPagosNoSuman(1),
    });
    expect(r).toEqual({ resultado: "no_aplicable", motivo: "PAGOS_NO_SUMAN" });
  });
});

describe("P10-7 estado de la outbox en memoria", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("una venta aplicada queda marcada como aplicada y no aparece en la lista", async () => {
    const opId = crypto.randomUUID();
    const r = await push(opId, 1, payloadVenta(1));
    expect(r.cuerpo["venta"]).toBe("aplicada");
    expect(await listarVentasNoAplicables()).toEqual([]);
    expect(store.outbox.has(opId)).toBe(true);
  });

  it("una venta no aplicable guarda el motivo y la fila no se borra", async () => {
    const opId = crypto.randomUUID();
    const payload = payloadPagosNoSuman(1);
    const r = await push(opId, 1, payload);
    expect(r.cuerpo["venta"]).toBe("no_aplicable");
    expect(await listarVentasNoAplicables()).toEqual([
      {
        op_id: opId,
        device_code: "caja-01",
        device_seq: 1,
        created_at: expect.any(String),
        motivo: "PAGOS_NO_SUMAN",
        payload,
      },
    ]);
    expect(store.outbox.has(opId)).toBe(true);
  });
});

describe("P10-7 repo: reintentar y descartar", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("reintentar con payload corregido aplica la venta y actualiza la outbox", async () => {
    const opId = crypto.randomUUID();
    await push(opId, 1, payloadPagosNoSuman(1));
    const corregido = payloadVenta(1);
    const r = await reintentarVentaNoAplicable(opId, corregido);
    expect(r.status).toBe(200);
    expect(r.cuerpo["resultado"]).toBe("aplicada");
    expect(await listarVentasNoAplicables()).toEqual([]);
    expect(store.outbox.has(opId)).toBe(true);
    expect(store.outbox.get(opId)?.payload).toMatchObject(corregido);
  });

  it("reintentar sin corregir mantiene la venta pendiente con su motivo", async () => {
    const opId = crypto.randomUUID();
    await push(opId, 1, payloadPagosNoSuman(1));
    const r = await reintentarVentaNoAplicable(opId);
    expect(r.status).toBe(200);
    expect(r.cuerpo["resultado"]).toBe("no_aplicable");
    expect(r.cuerpo["motivo"]).toBe("PAGOS_NO_SUMAN");
    expect(await listarVentasNoAplicables()).toHaveLength(1);
  });

  it("un payload corregido inválido no se guarda y responde 422", async () => {
    const opId = crypto.randomUUID();
    const original = payloadPagosNoSuman(1);
    await push(opId, 1, original);
    const r = await reintentarVentaNoAplicable(opId, { lineas: [] });
    expect(r.status).toBe(422);
    expect(store.outbox.get(opId)?.payload).toEqual(original);
    expect(await listarVentasNoAplicables()).toHaveLength(1);
  });

  it("no se reintenta una venta que ya no está pendiente", async () => {
    const opId = crypto.randomUUID();
    await push(opId, 1, payloadVenta(1));
    const r = await reintentarVentaNoAplicable(opId, payloadVenta(1));
    expect(r.status).toBe(409);
  });

  it("descartar marca la fila sin borrarla y no vuelve a aparecer", async () => {
    const opId = crypto.randomUUID();
    await push(opId, 1, payloadPagosNoSuman(1));
    const r = await descartarVentaNoAplicable(opId);
    expect(r.status).toBe(200);
    expect(r.cuerpo["estado"]).toBe("descartada");
    expect(await listarVentasNoAplicables()).toEqual([]);
    expect(store.outbox.has(opId)).toBe(true);
    expect((await descartarVentaNoAplicable(opId)).status).toBe(409);
  });

  it("una venta descartada no se re-aplica si el dispositivo reenvía la misma op", async () => {
    const opId = crypto.randomUUID();
    const original = payloadPagosNoSuman(1);
    await push(opId, 1, original);
    await descartarVentaNoAplicable(opId);
    const ventasAntes = store.idempotency.size;
    const r = await push(opId, 1, original);
    expect(r.status).toBe(200);
    expect(r.cuerpo["venta"]).toBe("descartada");
    expect(store.idempotency.size).toBe(ventasAntes);
    expect(store.outbox.get(opId)?.estado).toBe("descartada");
  });

  it("no se descarta una venta que no está pendiente", async () => {
    const opId = crypto.randomUUID();
    await push(opId, 1, payloadVenta(1));
    expect((await descartarVentaNoAplicable(opId)).status).toBe(409);
  });
});

describe("P10-7 GET y POST /api/sync/no-aplicables", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("sin sesión responde 403", async () => {
    expect((await pedirNoAplicables()).status).toBe(403);
  });

  it("un empleado no puede ver ni tocar las ventas pendientes", async () => {
    comercio("empleado", "g-2");
    const opId = crypto.randomUUID();
    await push(opId, 1, payloadPagosNoSuman(1));
    const plano = sesion("g-2", "t-1");
    expect((await pedirNoAplicables(plano)).status).toBe(403);
    expect((await enviarNoAplicable({ op_id: opId, accion: "reintentar" }, plano)).status).toBe(403);
  });

  it("el Dueño lista, reintenta y descarta", async () => {
    comercio();
    const opId = crypto.randomUUID();
    await push(opId, 1, payloadPagosNoSuman(1));
    const plano = sesion("g-1", "t-1");

    const get1 = await pedirNoAplicables(plano);
    expect(get1.status).toBe(200);
    const lista = (await get1.json()) as { items: Array<Record<string, unknown>> };
    expect(lista.items).toHaveLength(1);
    expect(lista.items[0]?.["op_id"]).toBe(opId);
    expect(lista.items[0]?.["motivo"]).toBe("PAGOS_NO_SUMAN");

    const reintento = await enviarNoAplicable(
      { op_id: opId, accion: "reintentar", payload: payloadVenta(1) },
      plano,
    );
    expect(reintento.status).toBe(200);
    expect(((await reintento.json()) as Record<string, unknown>)["resultado"]).toBe("aplicada");

    const get2 = (await (await pedirNoAplicables(plano)).json()) as { items: unknown[] };
    expect(get2.items).toEqual([]);

    const opDescarte = crypto.randomUUID();
    await push(opDescarte, 2, payloadPagosNoSuman(2));
    const descarte = await enviarNoAplicable({ op_id: opDescarte, accion: "descartar" }, plano);
    expect(descarte.status).toBe(200);
    expect(((await descarte.json()) as Record<string, unknown>)["estado"]).toBe("descartada");
  });

  it("un cuerpo inválido responde 422", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");
    expect((await enviarNoAplicable({ op_id: "no-es-uuid", accion: "reintentar" }, plano)).status).toBe(422);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);

let basePriv = "";

describe.skipIf(!hayPG)("P10-7 multi con PG local: estado en outbox, reintento y descarte", () => {
  const skuPG = `SYNNOAPL${sufijoPG}`.toUpperCase().slice(0, 32);
  const devicePG = `sync-noap-${sufijoPG}`.slice(0, 32);
  const opRetry = crypto.randomUUID();
  const opDescarte = crypto.randomUUID();
  let saleIdPG = "";
  let productIdPG = "";

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  function payloadPG(seq: number, pagos?: Array<{ medio: string; monto_centavos: number }>): Record<string, unknown> {
    return {
      lineas: [{ product_id: skuPG, qty: 1, precio_centavos: 15000 }],
      medio: "Efectivo",
      device_code: devicePG,
      seq_local: seq,
      client_occurred_at: new Date().toISOString(),
      ...(pagos ? { pagos } : {}),
    };
  }

  function pushPG(opId: string, seq: number, payload: Record<string, unknown>) {
    return empujarOperacion({
      opId,
      deviceCode: devicePG,
      deviceSeq: seq,
      hlc: `${Date.now()}:${seq}`,
      modulo: "sales",
      payload,
    });
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("sync_noapl_a", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
    productIdPG = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const ins = await db
        .insert(products)
        .values(filaPg({ sku: skuPG, nombre: "Producto P10-7", precioCentavos: 15000n, stockActual: 10 }))
        .returning({ id: products.id });
      return ins[0]?.id ?? "";
    });
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      if (saleIdPG) {
        await db.delete(ticketDiscounts).where(eq(ticketDiscounts.saleId, saleIdPG));
        await db.delete(ticketLines).where(eq(ticketLines.saleId, saleIdPG));
        await db.delete(ticketPayments).where(eq(ticketPayments.saleId, saleIdPG));
        await db.delete(tickets).where(eq(tickets.saleId, saleIdPG));
        await db.delete(cashMovements).where(eq(cashMovements.saleId, saleIdPG));
        await db.delete(stockMovements).where(eq(stockMovements.idemKey, opRetry));
        await db.delete(sales).where(eq(sales.id, saleIdPG));
      }
      await db.delete(outbox).where(eq(outbox.opId, opRetry));
      await db.delete(outbox).where(eq(outbox.opId, opDescarte));
      await db.delete(idMappings).where(eq(idMappings.opId, opRetry));
      await db.delete(idMappings).where(eq(idMappings.opId, opDescarte));
      if (productIdPG) await db.delete(products).where(eq(products.id, productIdPG));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  it("push no aplicable deja estado y motivo en la fila, el reintento la aplica", async () => {
    fijarMulti();
    const malo = payloadPG(1, [{ medio: "Efectivo", monto_centavos: 100 }]);
    const r1 = await conTenant("tenant-a", () => pushPG(opRetry, 1, malo));
    expect(r1.cuerpo["venta"]).toBe("no_aplicable");

    const lista = await conTenant("tenant-a", () => listarVentasNoAplicables());
    expect(lista).toHaveLength(1);
    expect(lista[0]?.op_id).toBe(opRetry);
    expect(lista[0]?.motivo).toBe("PAGOS_NO_SUMAN");

    const filaMala = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const filas = await db.select().from(outbox).where(eq(outbox.opId, opRetry));
      return filas[0];
    });
    expect(filaMala?.estado).toBe("no_aplicable:PAGOS_NO_SUMAN");

    const r2 = await conTenant("tenant-a", () => reintentarVentaNoAplicable(opRetry, payloadPG(1)));
    expect(r2.status).toBe(200);
    expect(r2.cuerpo["resultado"]).toBe("aplicada");
    saleIdPG = String(r2.cuerpo["sale_id"] ?? "");

    const filaBuena = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const filas = await db.select().from(outbox).where(eq(outbox.opId, opRetry));
      return filas[0];
    });
    expect(filaBuena?.estado).toBe("aplicada");
    expect(await conTenant("tenant-a", () => listarVentasNoAplicables())).toEqual([]);
  });

  it("descartar conserva la fila y la saca de la lista", async () => {
    fijarMulti();
    const malo = payloadPG(2, [{ medio: "Efectivo", monto_centavos: 100 }]);
    await conTenant("tenant-a", () => pushPG(opDescarte, 2, malo));
    const r = await conTenant("tenant-a", () => descartarVentaNoAplicable(opDescarte));
    expect(r.status).toBe(200);
    const fila = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const filas = await db.select().from(outbox).where(eq(outbox.opId, opDescarte));
      return filas[0];
    });
    expect(fila?.estado).toBe("descartada");
    expect(await conTenant("tenant-a", () => listarVentasNoAplicables())).toEqual([]);
  });
});
