import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { sha256Hex } from "../src/modules/auth/sesiones.js";
import { estadoNumeroCentral } from "../src/modules/whatsapp/tarjeta-bot.js";
import { ultimoEnvioCloud } from "../src/lib/whatsapp-salud.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";

process.env.WHATSAPP_APP_SECRET = "dash3-secret";

let n = 0;

function cuerpo(from: string, texto: string): string {
  n += 1;
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: `wamid-d3-${n}`, from, timestamp: String(Math.floor(Date.now() / 1000)), text: { body: texto } },
              ],
            },
          },
        ],
      },
    ],
  });
}

async function mandar(from: string, texto: string) {
  const raw = cuerpo(from, texto);
  const firma = `sha256=${createHmac("sha256", "dash3-secret").update(raw, "utf8").digest("hex")}`;
  return postWebhook(
    ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma }, body: raw }),
  );
}

function comercioVinculado() {
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
  control.memberships.set("m-1", { id: "m-1", tenantId: "t-1", googleSub: "g-1", rol: "dueno", permisos: [], estado: "activo", puedeUsarBot: true });
  control.botLinks.set("+5491100000000", { tenantId: "t-1", googleSub: "g-1", estado: "verificado" });
}

function sinCredenciales() {
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
}

beforeEach(() => {
  resetStore();
  sinCredenciales();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sinCredenciales();
});

describe("DASH-S3 webhook registra consultas del bot", () => {
  it("un vinculado que escribe suma 1 consulta", async () => {
    comercioVinculado();
    const r = await mandar("5491100000000", "hola");
    expect(r.status).toBe(200);
    expect(control.botConsultas.size).toBe(1);
  });

  it("un no vinculado no suma", async () => {
    comercioVinculado();
    const r = await mandar("5491199999999", "hola");
    expect(r.status).toBe(200);
    expect(control.botConsultas.size).toBe(0);
  });

  it("VINCULAR no suma", async () => {
    comercioVinculado();
    control.vincularCodes.set("+5491100000000", {
      codigoHash: sha256Hex("123456"),
      expiraEn: Date.now() + 60_000,
      usado: false,
      numeroRegistrado: "+5491100000000",
      tenantId: "t-1",
      googleSub: "g-1",
      intentosFallidos: 0,
    });
    const r = await mandar("5491100000000", "VINCULAR 123456");
    expect(((await r.json()) as { accion: string }).accion).toBe("vincular_ok");
    expect(control.botConsultas.size).toBe(0);
  });

  it("un envío fallido por Cloud API deja el número degradado en texto", async () => {
    comercioVinculado();
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
    process.env.WHATSAPP_TOKEN = "tok";
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 400, json: async () => ({}) }));
    const r = await mandar("5491100000000", "BAJA");
    expect(r.status).toBe(200);
    const ultimo = ultimoEnvioCloud();
    expect(ultimo?.ok).toBe(false);
    const estado = estadoNumeroCentral({ credencialesConfiguradas: true, ultimoEnvio: ultimo });
    expect(estado.estado).toBe("degradado");
    expect(estado.texto).toContain("Degradado");
  });
});
