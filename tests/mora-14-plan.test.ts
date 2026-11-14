import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { manifestFirmaMp } from "../src/lib/mp-webhook-firma.js";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import {
  crearProveedorCobro,
  MORA_COBRO_DIAS,
  olvidarPlanesEnMemoria,
  planIncluye,
  registrarEstadoCobroMp,
  registrarUso,
  solicitarPreaprobacionPlan,
  vincularPreaprobacionTenant,
} from "../src/lib/repos/planes.js";
import { POST as postMpWebhook } from "../src/pages/api/billing/webhooks/mercadopago.js";
import { POST as postWebhookWa } from "../src/pages/api/whatsapp/webhook.js";

const MS_DIA = 86_400_000;

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

describe("MORA-14 planIncluye tras pago rechazado", () => {
  beforeEach(() => {
    singleSinDb();
    olvidarPlanesEnMemoria();
  });

  it("a los 14 días apaga módulos de pago y deja núcleo incluido", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));
    const tenant = "t-mora";
    await crearProveedorCobro().crearSuscripcion({ tenantId: tenant, planId: "plus" });
    await registrarUso({
      tenantId: tenant,
      mes: "2026-10",
      feature: "bot_consulta",
      cantidad: 5,
      costoCentavos: 0n,
    });
    const pre = await solicitarPreaprobacionPlan({ tenantId: tenant, planId: "plus" });
    expect(pre.ok).toBe(true);
    if (!pre.ok) return;
    registrarEstadoCobroMp({
      preapprovalId: pre.preapprovalId,
      estado: "gracia",
      occurredAt: "2026-10-09T12:00:00.000Z",
    });
    vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));
    expect(MORA_COBRO_DIAS).toBe(14);
    expect(await planIncluye(tenant, "nucleo")).toMatchObject({ incluida: true, planId: "plus" });
    expect(await planIncluye(tenant, "bot_consulta")).toMatchObject({ incluida: false, planId: "plus" });
    expect(await planIncluye(tenant, "asistente_ia")).toMatchObject({ incluida: false, planId: "plus" });
    expect(await registrarUso({
      tenantId: tenant,
      mes: "2026-10",
      feature: "bot_consulta",
      cantidad: 1,
      costoCentavos: 0n,
    })).toEqual({ usado: 6, costoCentavos: 0n });
    vi.useRealTimers();
  });

  it("webhook gracia + activo con firma MP oficial reactiva módulos", async () => {
    const tenant = "t-mp";
    const preId = "pre-mora-test";
    vincularPreaprobacionTenant(preId, tenant);
    await crearProveedorCobro().crearSuscripcion({ tenantId: tenant, planId: "basico" });
    process.env.MP_WEBHOOK_SECRET = "mp-mora-secret";
    const dataId = "notif-mora-gracia";
    const firmar = (id: string, estado: "activo" | "gracia" | "suspendido", occurred_at: string) => {
      const ts = String(Date.now());
      const manifest = manifestFirmaMp(id, "req-mora", ts);
      const v1 = createHmac("sha256", "mp-mora-secret").update(manifest, "utf8").digest("hex");
      return {
        headers: {
          "x-signature": `ts=${ts},v1=${v1}`,
          "x-request-id": "req-mora",
          "content-type": "application/json",
        },
        body: {
          preapproval_id: preId,
          estado,
          occurred_at,
          data: { id },
        },
      };
    };
    const gracia = firmar(dataId, "gracia", "2026-10-01T00:00:00.000Z");
    const req = (init: ReturnType<typeof firmar>) =>
      postMpWebhook(ctx("http://x/api/billing/webhooks/mercadopago", { method: "POST", ...init }));
    expect((await req(gracia)).status).toBe(201);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T00:00:00.000Z"));
    expect(await planIncluye(tenant, "bot_consulta")).toMatchObject({ incluida: false });
    const activo = firmar("notif-mora-activo", "activo", "2026-10-20T00:00:00.000Z");
    const r2 = await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", { method: "POST", ...activo }),
    );
    expect(r2.status).toBe(201);
    expect(await planIncluye(tenant, "bot_consulta")).toMatchObject({ incluida: true, cupo: 100 });
    vi.useRealTimers();
    delete process.env.MP_WEBHOOK_SECRET;
  });

  it("webhook WhatsApp en mora responde suspendida sin registrar consulta", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T15:00:00.000Z"));
    resetStore();
    singleSinDb();
    olvidarPlanesEnMemoria();
    const secretoPrevio = process.env.WHATSAPP_APP_SECRET;
    process.env.WHATSAPP_APP_SECRET = "wa-mora-secret";
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    control.tenants.set("t-wa", {
      id: "t-wa",
      nombreComercio: "Kiosco",
      slug: "kiosco",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: "g-1",
      esDemo: false,
    });
    control.memberships.set("m-1", {
      id: "m-1",
      tenantId: "t-wa",
      googleSub: "g-1",
      rol: "dueno",
      permisos: [],
      estado: "activo",
      puedeUsarBot: true,
    });
    control.botLinks.set("+5491100000001", { tenantId: "t-wa", googleSub: "g-1", estado: "verificado" });
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-wa", planId: "basico" });
    const pre = await solicitarPreaprobacionPlan({ tenantId: "t-wa", planId: "basico" });
    expect(pre.ok).toBe(true);
    if (!pre.ok) return;
    registrarEstadoCobroMp({
      preapprovalId: pre.preapprovalId,
      estado: "gracia",
      occurredAt: new Date("2026-10-09T15:00:00.000Z").toISOString(),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const raw = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid-mora-bot",
                    from: "5491100000001",
                    timestamp: String(Math.floor(Date.parse("2026-10-23T15:00:00.000Z") / 1000)),
                    text: { body: "stock coca" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const firma = `sha256=${createHmac("sha256", "wa-mora-secret").update(raw, "utf8").digest("hex")}`;
    const r = await postWebhookWa(
      ctx("http://x/api/whatsapp/webhook", {
        method: "POST",
        headers: { "X-Hub-Signature-256": firma },
        body: raw,
      }),
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { accion: string; respuesta: string; enviado: boolean };
    expect(body.accion).toBe("cuenta_suspendida");
    expect(body.respuesta.toLowerCase()).toContain("suspendida");
    expect(body.enviado).toBe(false);
    expect(control.botConsultas.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (secretoPrevio === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = secretoPrevio;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
