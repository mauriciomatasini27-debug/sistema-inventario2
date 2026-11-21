import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearAlmacenSuscripciones } from "../src/lib/repos/_almacen.js";
import {
  crearProveedorCobro,
  leerSuscripcionActiva,
  olvidarPlanesEnMemoria,
  planIncluye,
  tenantIdDePreapproval,
  vincularPreaprobacionTenant,
} from "../src/lib/repos/planes.js";
import { olvidarEventosMpEnMemoria } from "../src/lib/repos/mp-webhooks.js";
import { POST as postMpWebhook } from "../src/pages/api/billing/webhooks/mercadopago.js";
import { POST as postSuscribir } from "../src/pages/api/plan/suscribir.js";

const SECRETO = "mp-real-secret";
const TOKEN = "mp-access-token";
const TENANT = "t-mp-real";
const AHORA_MS = Date.parse("2026-11-21T12:00:00.000Z");
const TS = String(Math.floor(AHORA_MS / 1000));
const MS_DIA = 86_400_000;

interface Llamado {
  readonly url: string;
  readonly init: { readonly method?: string; readonly headers?: Record<string, string>; readonly body?: string };
}

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function firmar(dataId: string, opts: { ts?: string; requestId?: string; secreto?: string } = {}) {
  const requestId = opts.requestId ?? "req-1";
  const ts = opts.ts ?? TS;
  // P1-91: manifest armado con el contrato de MP, sin pasar por el helper de producción.
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", opts.secreto ?? SECRETO).update(manifest, "utf8").digest("hex");
  return {
    "x-signature": `ts=${ts},v1=${v1}`,
    "x-request-id": requestId,
    "content-type": "application/json",
  };
}

function stubMp(respuestas: Record<string, unknown | (() => unknown)>): Llamado[] {
  const llamados: Llamado[] = [];
  vi.stubGlobal(
    "fetch",
    async (
      url: unknown,
      init: { method?: string; headers?: Record<string, string>; body?: string } = {},
    ) => {
      llamados.push({ url: String(url), init });
      const entrada = respuestas[String(url)];
      const datos = typeof entrada === "function" ? (entrada as () => unknown)() : entrada;
      if (datos === undefined) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => datos };
    },
  );
  return llamados;
}

function eventoMp(
  tipo: string,
  dataId: string,
  headers: Record<string, string>,
  eventoId = `evt-${dataId}`,
) {
  return postMpWebhook(
    ctx(`http://x/api/billing/webhooks/mercadopago?type=${tipo}&data.id=${dataId}`, {
      method: "POST",
      headers,
      body: {
        id: eventoId,
        live_mode: true,
        type: tipo,
        date_created: new Date(AHORA_MS).toISOString(),
        user_id: 1,
        api_version: "v1",
        action: "updated",
        data: { id: dataId },
      },
    }),
  );
}

function subsActivas(tenantId: string): number {
  let n = 0;
  for (const s of crearAlmacenSuscripciones().comoMapaSoloLectura().values()) {
    if (s.tenantId === tenantId && s.estado === "activa") n++;
  }
  return n;
}

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA_MS, toFake: ["Date"] });
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
  olvidarEventosMpEnMemoria();
  process.env.MP_WEBHOOK_SECRET = SECRETO;
  process.env.MP_ACCESS_TOKEN = TOKEN;
  delete process.env.NODE_ENV;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.MP_WEBHOOK_SECRET;
  delete process.env.MP_ACCESS_TOKEN;
  delete process.env.NODE_ENV;
});

describe("P1-91 webhook MP contrato real", () => {
  it("acepta el vector de firma calculado con el manifest literal", async () => {
    const dataId = "pre-vector";
    const llamados = stubMp({
      [`https://api.mercadopago.com/preapproval/${dataId}`]: {
        id: dataId,
        status: "pending",
        external_reference: TENANT,
        reason: "Plan plus",
      },
    });
    // P1-91: v1 calculado a mano para id:pre-vector;request-id:req-vector;ts:1795262400;
    const headers = {
      "x-signature": "ts=1795262400,v1=026f09d17afcec8ad8b36571a0642eef05b631629484697add2ccf94e469ab1c",
      "x-request-id": "req-vector",
      "content-type": "application/json",
    };
    const r = (await postMpWebhook(
      ctx(`http://x/api/billing/webhooks/mercadopago?type=subscription_preapproval&data.id=${dataId}`, {
        method: "POST",
        headers,
        body: { type: "subscription_preapproval", data: { id: dataId } },
      }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(llamados.map((l) => l.url)).toEqual([
      `https://api.mercadopago.com/preapproval/${dataId}`,
    ]);
  });

  it("firma inválida responde 401 y no consulta ni persiste", async () => {
    const dataId = "pre-bad";
    const llamados = stubMp({});
    const headers = firmar(dataId);
    headers["x-signature"] = `ts=${TS},v1=${"0".repeat(64)}`;
    const r = (await eventoMp("subscription_preapproval", dataId, headers)) as Response;
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("firma inválida");
    expect(llamados).toEqual([]);
    expect(await leerSuscripcionActiva(TENANT)).toBeNull();
  });

  it("subscription_preapproval consulta MP y persiste authorized en subscriptions", async () => {
    const dataId = "pre-1";
    const llamados = stubMp({
      [`https://api.mercadopago.com/preapproval/${dataId}`]: {
        id: dataId,
        status: "authorized",
        external_reference: TENANT,
        reason: "Plan plus",
      },
    });
    const r = (await eventoMp("subscription_preapproval", dataId, firmar(dataId))) as Response;
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      tipo: "subscription_preapproval",
      id: dataId,
      estado: "authorized",
    });
    expect(llamados).toHaveLength(1);
    expect(llamados[0]!.init.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    const activa = await leerSuscripcionActiva(TENANT);
    expect(activa).toMatchObject({ tenantId: TENANT, planId: "plus", estado: "activa" });
    expect(await tenantIdDePreapproval(dataId)).toBe(TENANT);
  });

  it("reintento idempotente: 200 otra vez y una sola suscripción activa", async () => {
    const dataId = "pre-replay";
    stubMp({
      [`https://api.mercadopago.com/preapproval/${dataId}`]: {
        id: dataId,
        status: "authorized",
        external_reference: TENANT,
        reason: "Plan plus",
      },
    });
    const headers = firmar(dataId);
    const primero = (await eventoMp("subscription_preapproval", dataId, headers)) as Response;
    expect(primero.status).toBe(200);
    const segundo = (await eventoMp("subscription_preapproval", dataId, headers)) as Response;
    expect(segundo.status).toBe(200);
    expect(await segundo.json()).toEqual({
      duplicado: true,
      key: `subscription_preapproval:evt-${dataId}`,
    });
    expect(subsActivas(TENANT)).toBe(1);
  });

  it("subscription_authorized_payment rechazado consulta MP y deja mora a 14 días", async () => {
    const preapprovalId = "pre-mora";
    vincularPreaprobacionTenant(preapprovalId, TENANT);
    await crearProveedorCobro().crearSuscripcion({ tenantId: TENANT, planId: "plus" });
    const pagoId = "pay-1";
    const llamados = stubMp({
      [`https://api.mercadopago.com/authorized_payments/${pagoId}`]: {
        id: pagoId,
        status: "rejected",
        preapproval_id: preapprovalId,
        payment: { status: "rejected" },
      },
    });
    const r = (await eventoMp("subscription_authorized_payment", pagoId, firmar(pagoId))) as Response;
    expect(r.status).toBe(200);
    expect(llamados.map((l) => l.url)).toEqual([
      `https://api.mercadopago.com/authorized_payments/${pagoId}`,
    ]);
    expect(await planIncluye(TENANT, "bot_consulta")).toMatchObject({ incluida: true });
    vi.setSystemTime(new Date(AHORA_MS + 14 * MS_DIA));
    expect(await planIncluye(TENANT, "bot_consulta")).toMatchObject({ incluida: false });
  });

  it("payment consulta /v1/payments/{id} sin tocar subscriptions", async () => {
    const pagoId = "pay-9";
    const llamados = stubMp({
      [`https://api.mercadopago.com/v1/payments/${pagoId}`]: {
        id: pagoId,
        status: "approved",
      },
    });
    const r = (await eventoMp("payment", pagoId, firmar(pagoId))) as Response;
    expect(r.status).toBe(200);
    expect(llamados.map((l) => l.url)).toEqual([
      `https://api.mercadopago.com/v1/payments/${pagoId}`,
    ]);
    expect(await leerSuscripcionActiva(TENANT)).toBeNull();
  });

  it("pending no crea suscripción y cancelled apaga la activa con otro aviso", async () => {
    const dataId = "pre-ciclo";
    let status = "pending";
    stubMp({
      [`https://api.mercadopago.com/preapproval/${dataId}`]: () => ({
        id: dataId,
        status,
        external_reference: TENANT,
        reason: "Plan plus",
      }),
    });
    const pendiente = (await eventoMp(
      "subscription_preapproval",
      dataId,
      firmar(dataId),
      "evt-pending",
    )) as Response;
    expect(pendiente.status).toBe(200);
    expect(await leerSuscripcionActiva(TENANT)).toBeNull();

    status = "authorized";
    await eventoMp("subscription_preapproval", dataId, firmar(dataId), "evt-authorized");
    expect(await leerSuscripcionActiva(TENANT)).toMatchObject({ estado: "activa", planId: "plus" });

    status = "cancelled";
    await eventoMp("subscription_preapproval", dataId, firmar(dataId), "evt-cancelled");
    expect(await leerSuscripcionActiva(TENANT)).toBeNull();
    expect(subsActivas(TENANT)).toBe(0);
  });

  it("tópico desconocido responde 200 y no consulta MP ni cambia estado", async () => {
    const dataId = "mo-1";
    const llamados = stubMp({});
    const r = (await eventoMp("merchant_order", dataId, firmar(dataId))) as Response;
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ignorado: true, tipo: "merchant_order" });
    expect(llamados).toEqual([]);
    expect(await leerSuscripcionActiva(TENANT)).toBeNull();
  });
});

function comercio() {
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
  control.users.set("g-1", {
    googleSub: "g-1",
    email: "dueno@test.com",
    emailVerificado: true,
  });
  control.memberships.set("m-1", {
    id: "m-1",
    tenantId: "t-1",
    googleSub: "g-1",
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  control.memberships.set("m-2", {
    id: "m-2",
    tenantId: "t-1",
    googleSub: "g-2",
    rol: "empleado",
    permisos: [],
    estado: "activo",
  });
}

function sesion(sub: string, tenantId: string | null): string {
  const ahora = new Date(AHORA_MS);
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
  });
  return c.idPlano;
}

describe("P1-91 POST /api/plan/suscribir", () => {
  beforeEach(() => {
    singleSinDb();
    resetStore();
    olvidarPlanesEnMemoria();
    comercio();
  });

  it("arma el body exacto de MP y devuelve init_point", async () => {
    const llamados = stubMp({
      "https://api.mercadopago.com/preapproval": {
        id: "pre-9",
        init_point: "https://mp/checkout/pre-9",
      },
    });
    const plano = sesion("g-1", "t-1");
    const r = (await postSuscribir(
      ctx("http://x/api/plan/suscribir", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${plano}` },
        body: { plan: "plus" },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({
      preapproval_id: "pre-9",
      init_point: "https://mp/checkout/pre-9",
      plan: "plus",
    });
    expect(llamados).toHaveLength(1);
    const [llamado] = llamados;
    expect(llamado!.url).toBe("https://api.mercadopago.com/preapproval");
    expect(llamado!.init.method).toBe("POST");
    expect(llamado!.init.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(llamado!.init.body ?? "")).toEqual({
      reason: "Plan plus",
      external_reference: "t-1",
      payer_email: "dueno@test.com",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 35,
        currency_id: "ARS",
      },
      back_url: "http://x/panel/plan",
      status: "pending",
    });
    expect(await tenantIdDePreapproval("pre-9")).toBe("t-1");
  });

  it("un empleado no puede suscribirse", async () => {
    const llamados = stubMp({});
    const plano = sesion("g-2", "t-1");
    const r = (await postSuscribir(
      ctx("http://x/api/plan/suscribir", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${plano}` },
        body: { plan: "plus" },
      }),
    )) as Response;
    expect(r.status).toBe(403);
    expect(llamados).toEqual([]);
  });
});
