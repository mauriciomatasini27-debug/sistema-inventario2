import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { getTenantDb } from "../src/lib/db.js";
import { mpWebhookEvents } from "../src/db/schema.js";
import { manifestFirmaMp, timestampFirmaMpMs, verificarFirmaMpWebhook } from "../src/lib/mp-webhook-firma.js";
import { olvidarEventosMpEnMemoria } from "../src/lib/repos/mp-webhooks.js";
import { POST as postMpWebhook } from "../src/pages/api/billing/webhooks/mercadopago.js";

const SECRETO = "p178-mp-secret";

function firmar(opts: {
  dataId?: string;
  requestId?: string;
  ts?: string;
  secreto?: string;
}): { xSignature: string; headers: Record<string, string> } {
  const ts = opts.ts ?? String(Date.now());
  const manifest = manifestFirmaMp(opts.dataId, opts.requestId, ts);
  const v1 = createHmac("sha256", opts.secreto ?? SECRETO).update(manifest, "utf8").digest("hex");
  const xSignature = `ts=${ts},v1=${v1}`;
  const headers: Record<string, string> = {
    "x-signature": xSignature,
    "content-type": "application/json",
  };
  if (opts.requestId) headers["x-request-id"] = opts.requestId;
  return { xSignature, headers };
}

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

describe("timestampFirmaMpMs", () => {
  it("escala ts en segundos (10 dígitos) a ms y deja ms intactos", () => {
    expect(timestampFirmaMpMs("1704908010")).toBe(1_704_908_010_000);
    const nowMs = Date.now();
    expect(timestampFirmaMpMs(String(nowMs))).toBe(nowMs);
  });

  it("verificarFirmaMpWebhook acepta ts en segundos dentro de la ventana", () => {
    const ahora = 1_765_000_000_000;
    const tsSec = String(Math.floor(ahora / 1000));
    const manifest = manifestFirmaMp("e1", "r1", tsSec);
    const v1 = createHmac("sha256", SECRETO).update(manifest, "utf8").digest("hex");
    expect(
      verificarFirmaMpWebhook({
        xSignature: `ts=${tsSec},v1=${v1}`,
        xRequestId: "r1",
        dataId: "e1",
        secreto: SECRETO,
        ahoraMs: ahora,
      }),
    ).toEqual({ ok: true });
  });

  it("rechaza ts en segundos viejo o futuro", () => {
    const ahora = 1_765_000_000_000;
    const firmarSec = (offsetSec: number) => {
      const tsSec = String(Math.floor(ahora / 1000) + offsetSec);
      const manifest = manifestFirmaMp("e1", "r1", tsSec);
      const v1 = createHmac("sha256", SECRETO).update(manifest, "utf8").digest("hex");
      return verificarFirmaMpWebhook({
        xSignature: `ts=${tsSec},v1=${v1}`,
        xRequestId: "r1",
        dataId: "e1",
        secreto: SECRETO,
        ahoraMs: ahora,
      });
    };
    expect(firmarSec(-600)).toEqual({ ok: false, codigo: "ts_viejo" });
    expect(firmarSec(600)).toEqual({ ok: false, codigo: "ts_viejo" });
    expect(firmarSec(0)).toEqual({ ok: true });
  });
});

describe("P1-80 firma webhook Mercado Pago", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
    olvidarEventosMpEnMemoria();
    process.env.MP_WEBHOOK_SECRET = SECRETO;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.NODE_ENV;
  });

  it("firma válida con ts en segundos (MP real) procesa 201", async () => {
    const preId = `p180-sec-${Date.now().toString(36)}`;
    const dataId = "evt-sec";
    const ts = String(Math.floor(Date.now() / 1000));
    const { headers } = firmar({ dataId, requestId: "req-sec", ts });
    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers,
        body: { preapproval_id: preId, estado: "activo" as const, data: { id: dataId } },
      }),
    )) as Response;
    expect(r.status).toBe(201);
  });

  it("firma válida procesa 201", async () => {
    const preId = `p178-ok-${Date.now().toString(36)}`;
    const dataId = "evt-123";
    const { headers } = firmar({ dataId, requestId: "req-abc" });
    const cuerpo = {
      preapproval_id: preId,
      estado: "activo" as const,
      data: { id: dataId },
    };
    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", { method: "POST", headers, body: cuerpo }),
    )) as Response;
    expect(r.status).toBe(201);
  });

  it("firma inválida responde 401", async () => {
    const cuerpo = { preapproval_id: "pre-bad", estado: "activo" as const, data: { id: "x" } };
    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers: {
          "x-signature": `ts=${Date.now()},v1=${"0".repeat(64)}`,
          "x-request-id": "req-bad",
          "content-type": "application/json",
        },
        body: cuerpo,
      }),
    )) as Response;
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("firma inválida");
  });

  it("header x-signature ausente responde 401", async () => {
    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { preapproval_id: "pre-sin", estado: "activo" as const, data: { id: "1" } },
      }),
    )) as Response;
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("firma ausente");
  });

  it("ts viejo responde 401", async () => {
    const viejo = String(Date.now() - 10 * 60 * 1000);
    const dataId = "evt-old";
    const { headers } = firmar({ dataId, requestId: "req-old", ts: viejo });
    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers,
        body: { preapproval_id: "pre-old", estado: "activo" as const, data: { id: dataId } },
      }),
    )) as Response;
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("firma expirada");
  });

  it("sin secreto en production responde 401 sin procesar", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.MP_WEBHOOK_ALLOW_TEST = "1";
    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers: { "x-test": "true" },
        body: { preapproval_id: "pre-nosec", estado: "activo" as const },
      }),
    )) as Response;
    expect(r.status).toBe(401);
  });

  it("sin MP_WEBHOOK_ALLOW_TEST el x-test no bypassa aunque falte secreto", async () => {
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.MP_WEBHOOK_ALLOW_TEST;
    delete process.env.NODE_ENV;
    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers: { "x-test": "true" },
        body: { preapproval_id: "pre-nobypass", estado: "activo" as const },
      }),
    )) as Response;
    expect(r.status).toBe(401);
  });

  it("manifest sin x-request-id acepta firma válida", async () => {
    const dataId = "solo-id";
    const { headers } = firmar({ dataId });
    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers,
        body: { preapproval_id: "pre-norid", estado: "activo" as const, data: { id: dataId } },
      }),
    )) as Response;
    expect(r.status).toBe(201);
  });

  it("data.id alfanumérico en mayúsculas coincide con manifest en minúsculas", async () => {
    const dataId = "AbC123XyZ";
    const ts = String(Date.now());
    const manifest = manifestFirmaMp(dataId, "req-upper", ts);
    const v1 = createHmac("sha256", SECRETO).update(manifest, "utf8").digest("hex");
    expect(manifest).toContain("id:abc123xyz");
    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers: {
          "x-signature": `ts=${ts},v1=${v1}`,
          "x-request-id": "req-upper",
          "content-type": "application/json",
        },
        body: { preapproval_id: "pre-upper", estado: "activo" as const, data: { id: dataId } },
      }),
    )) as Response;
    expect(r.status).toBe(201);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

describe.skipIf(!hayPG)("P1-80 firma inválida no escribe en mp_webhook_events", () => {
  const claves: string[] = [];
  let urlAnterior: string | undefined;

  afterEach(async () => {
    if (process.env.TENANT_DATABASE_URL) {
      for (const clave of claves) {
        await getTenantDb().delete(mpWebhookEvents).where(eq(mpWebhookEvents.clave, clave));
      }
    }
    if (urlAnterior === undefined) delete process.env.TENANT_DATABASE_URL;
    else process.env.TENANT_DATABASE_URL = urlAnterior;
    delete process.env.MP_WEBHOOK_SECRET;
    claves.length = 0;
  });

  it("401 y cero filas tras firma inválida", async () => {
    urlAnterior = process.env.TENANT_DATABASE_URL;
    delete process.env.TENANT_MODE;
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
    process.env.MP_WEBHOOK_SECRET = SECRETO;
    resetStore();
    olvidarEventosMpEnMemoria();

    const preId = `p178-pg-${Date.now().toString(36)}`;
    const clave = `${preId}:activo`;
    claves.push(clave);

    const r = (await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers: {
          "x-signature": `ts=${Date.now()},v1=${"f".repeat(64)}`,
          "x-request-id": "req-pg",
          "content-type": "application/json",
        },
        body: { preapproval_id: preId, estado: "activo" as const, data: { id: "pg-1" } },
      }),
    )) as Response;
    expect(r.status).toBe(401);
    const filas = await getTenantDb().select().from(mpWebhookEvents).where(eq(mpWebhookEvents.clave, clave));
    expect(filas.length).toBe(0);
  });
});