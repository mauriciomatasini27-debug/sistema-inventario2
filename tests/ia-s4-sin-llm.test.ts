import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { crearRegistroUsoIA, olvidarUsoIAMemoria } from "../src/lib/repos/ia-uso.js";
import { mesAR } from "../src/lib/fecha-ar.js";

// IA-S4: sin ASSISTANT_LLM_KEY el proveedor es el fake, que devuelve el
// prompt crudo. Ni el panel ni WhatsApp le muestran eso al comercio.
const { POST } = await import("../src/pages/api/asistente.js");
const { POST: postWebhook } = await import("../src/pages/api/whatsapp/webhook.js");

const AHORA = new Date("2026-10-17T12:00:00.000Z");

function limpiarEnv() {
  delete process.env.ASSISTANT_LLM_KEY;
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
}

async function comercioPlus() {
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
  control.memberships.set("m-1", {
    id: "m-1",
    tenantId: "t-1",
    googleSub: "g-1",
    rol: "dueno",
    permisos: [],
    estado: "activo",
    puedeUsarBot: true,
  });
  control.botLinks.set("+5491100000000", { tenantId: "t-1", googleSub: "g-1", estado: "verificado" });
  await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
}

function sesionDueno(): string {
  const c = crearSesion({ googleSub: "g-1", tenantId: "t-1", ahora: AHORA });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: "g-1",
    tenantId: "t-1",
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: AHORA.toISOString(),
  });
  return c.idPlano;
}

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  limpiarEnv();
  process.env.WHATSAPP_APP_SECRET = "ia4-sin-llm";
  resetStore();
  olvidarPlanesEnMemoria();
  olvidarUsoIAMemoria();
});

afterEach(() => {
  vi.useRealTimers();
  limpiarEnv();
});

describe("IA-S4 sin LLM configurado", () => {
  it("POST /api/asistente responde 503 asistente_no_configurado y no registra uso", async () => {
    await comercioPlus();
    const r = await POST(
      ctx("http://x/api/asistente", {
        headers: { cookie: `__Host-sesion=${sesionDueno()}` },
        body: { pregunta: "¿cuál es el saldo de caja de hoy?" },
      }),
    );
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({
      error: "El asistente IA todavía no está configurado.",
      codigo: "asistente_no_configurado",
    });
    expect((await crearRegistroUsoIA().usoDelMes("t-1", mesAR())).consultas).toBe(0);
  });

  it("el webhook sigue el flujo actual en vez de contestar con el fake", async () => {
    await comercioPlus();
    const raw = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid-ia4-sin-llm",
                    from: "5491100000000",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: { body: "¿cuál es el saldo de caja de hoy?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const firma = `sha256=${createHmac("sha256", "ia4-sin-llm").update(raw, "utf8").digest("hex")}`;
    const r = await postWebhook(
      ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma }, body: raw }),
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["accion"]).toBe("consulta");
    expect(body["respuesta"]).toBeUndefined();
    expect((await crearRegistroUsoIA().usoDelMes("t-1", mesAR())).consultas).toBe(0);
  });
});
