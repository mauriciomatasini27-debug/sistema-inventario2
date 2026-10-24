import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { registrarConsultaBot } from "../src/lib/repos/bot-consultas.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";

process.env.WHATSAPP_APP_SECRET = "wa-cupo-secret";

const HOY_MS = Date.parse("2026-10-23T15:00:00.000Z");
let wamidN = 0;

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

function comercioBasico() {
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
}

async function suscripcion(planId: "basico" | "plus" | "pro") {
  const cobro = crearProveedorCobro();
  await cobro.crearSuscripcion({ tenantId: "t-wa", planId });
}

function cuerpo(from: string, texto: string): string {
  wamidN += 1;
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: `wamid-wa-cupo-${wamidN}`,
                  from,
                  timestamp: String(Math.floor(HOY_MS / 1000)),
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
  const firma = `sha256=${createHmac("sha256", "wa-cupo-secret").update(raw, "utf8").digest("hex")}`;
  return postWebhook(
    ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma }, body: raw }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(HOY_MS);
  resetStore();
  singleSinDb();
  olvidarPlanesEnMemoria();
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WA-CUPO webhook bot_consulta", () => {
  it("Básico: la consulta 100 pasa y la 101 avisa agotado sin fetch a Cloud API", async () => {
    comercioBasico();
    await suscripcion("basico");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 99; i++) {
      await registrarConsultaBot({
        tenantId: "t-wa",
        numeroE164: "+5491100000001",
        wamid: `seed-${i}`,
        ahoraMs: HOY_MS - i * 60_000,
      });
    }

    const ok = await mandar("5491100000001", "hola 100");
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { accion: string }).accion).not.toBe("cupo_bot_agotado");

    fetchMock.mockClear();
    const agotado = await mandar("5491100000001", "hola 101");
    expect(agotado.status).toBe(200);
    const body = (await agotado.json()) as { accion: string; respuesta: string; enviado: boolean };
    expect(body.accion).toBe("cupo_bot_agotado");
    expect(body.respuesta).toContain("Llegaste al cupo de WhatsApp");
    expect(body.enviado).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(control.botConsultas.size).toBe(100); // 99 sembradas + la consulta 100
  });

  it("Plus: sin techo definido no corta aunque haya muchas consultas", async () => {
    comercioBasico();
    await suscripcion("plus");
    for (let i = 0; i < 150; i++) {
      await registrarConsultaBot({
        tenantId: "t-wa",
        numeroE164: "+5491100000001",
        wamid: `plus-${i}`,
        ahoraMs: HOY_MS - i * 30_000,
      });
    }
    const r = await mandar("5491100000001", "stock coca");
    expect(r.status).toBe(200);
    expect(((await r.json()) as { accion: string }).accion).not.toBe("cupo_bot_agotado");
  });

  it("Pro: sin techo definido no corta", async () => {
    comercioBasico();
    await suscripcion("pro");
    for (let i = 0; i < 200; i++) {
      await registrarConsultaBot({
        tenantId: "t-wa",
        numeroE164: "+5491100000001",
        wamid: `pro-${i}`,
        ahoraMs: HOY_MS - i * 20_000,
      });
    }
    const r = await mandar("5491100000001", "precio jorgito");
    expect(r.status).toBe(200);
    expect(((await r.json()) as { accion: string }).accion).not.toBe("cupo_bot_agotado");
  });

  it("Básico al 80% encola un mail al Dueño y sigue respondiendo", async () => {
    comercioBasico();
    control.users.set("g-1", { googleSub: "g-1", email: "dueno@kiosco.test", emailVerificado: true });
    await suscripcion("basico");
    for (let i = 0; i < 79; i++) {
      await registrarConsultaBot({
        tenantId: "t-wa",
        numeroE164: "+5491100000001",
        wamid: `80-${i}`,
        ahoraMs: HOY_MS - i * 60_000,
      });
    }
    const r1 = await mandar("5491100000001", "hola 80a");
    const r2 = await mandar("5491100000001", "hola 80b");
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(((await r1.json()) as { accion: string }).accion).not.toBe("cupo_bot_agotado");
    expect(((await r2.json()) as { accion: string }).accion).not.toBe("cupo_bot_agotado");
    const keys80 = [...store.emailOutbox.keys()].filter((k) => k.includes("cuenta:cupo:t-wa:2026-10:80"));
    expect(keys80).toHaveLength(1);
  });

  it("Básico al 100% avisa agotado con web, un mail y sin gastar cupo", async () => {
    comercioBasico();
    control.users.set("g-1", { googleSub: "g-1", email: "dueno@kiosco.test", emailVerificado: true });
    await suscripcion("basico");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 100; i++) {
      await registrarConsultaBot({
        tenantId: "t-wa",
        numeroE164: "+5491100000001",
        wamid: `100-${i}`,
        ahoraMs: HOY_MS - i * 60_000,
      });
    }
    const ag1 = await mandar("5491100000001", "hola 100a");
    const ag2 = await mandar("5491100000001", "hola 100b");
    expect(ag1.status).toBe(200);
    expect(ag2.status).toBe(200);
    const body1 = (await ag1.json()) as { accion: string; respuesta: string };
    const body2 = (await ag2.json()) as { accion: string; respuesta: string };
    expect(body1.accion).toBe("cupo_bot_agotado");
    expect(body2.accion).toBe("cupo_bot_agotado");
    for (const resp of [body1.respuesta, body2.respuesta]) {
      expect(resp).toContain("Llegaste al cupo de WhatsApp");
      expect(resp).toContain("wa.me");
      expect(resp).toContain("web");
    }
    expect(control.botConsultas.size).toBe(100);
    const keys100 = [...store.emailOutbox.keys()].filter((k) => k.includes("cuenta:cupo:t-wa:2026-10:100"));
    expect(keys100).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
