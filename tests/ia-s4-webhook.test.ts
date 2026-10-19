import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { olvidarUsoIAMemoria } from "../src/lib/repos/ia-uso.js";

const mocks = vi.hoisted(() => {
  const espia = {
    llamadas: 0,
    completar: async () => {
      espia.llamadas += 1;
      return { texto: "Vendiste Yerba", tokensEntrada: 3, tokensSalida: 2 };
    },
  };
  return { espia };
});

vi.mock("../src/modules/ia/proveedor.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/modules/ia/proveedor.js")>();
  return { ...real, crear_proveedor_llm_desde_env: () => mocks.espia };
});

const { POST: postWebhook } = await import("../src/pages/api/whatsapp/webhook.js");

process.env.WHATSAPP_APP_SECRET = "ia4-secret";

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
                {
                  id: `wamid-ia4-${n}`,
                  from,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: texto },
                },
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
  const firma = `sha256=${createHmac("sha256", "ia4-secret").update(raw, "utf8").digest("hex")}`;
  return postWebhook(
    ctx("http://x/api/whatsapp/webhook", {
      method: "POST",
      headers: { "X-Hub-Signature-256": firma },
      body: raw,
    }),
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
}

function sinCredenciales() {
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

beforeEach(() => {
  sinCredenciales();
  resetStore();
  olvidarPlanesEnMemoria();
  olvidarUsoIAMemoria();
  mocks.espia.llamadas = 0;
});

afterEach(() => {
  sinCredenciales();
});

describe("IA-S4 webhook WhatsApp", () => {
  it("con el plan encendido contesta con el asistente", async () => {
    comercioVinculado();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    const r = await mandar("5491100000000", "¿cuál es el saldo de caja de hoy?");
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["accion"]).toBe("asistente");
    expect(body["respuesta"]).toBe("Vendiste Yerba");
    expect(body["herramienta"]).toBe("caja_dia");
    expect(mocks.espia.llamadas).toBe(1);
  });

  it("con el módulo apagado sigue el flujo actual sin llamar al LLM", async () => {
    comercioVinculado();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    const r = await mandar("5491100000000", "¿qué vendí más esta semana?");
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["accion"]).toBe("consulta");
    expect(body["respuesta"]).toBeUndefined();
    expect(mocks.espia.llamadas).toBe(0);
  });

  it("un mensaje que reconoce la consulta de stock no va al asistente", async () => {
    comercioVinculado();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    const r = await mandar("5491100000000", "cuántos milka tengo");
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["accion"]).toBe("consulta");
    expect(mocks.espia.llamadas).toBe(0);
  });
});
