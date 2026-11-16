import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { registrarEnvioCloud } from "../src/lib/whatsapp-salud.js";
import { registrarConsultaBot } from "../src/lib/repos/bot-consultas.js";
import { GET as getResumen } from "../src/pages/api/whatsapp/resumen.js";

const AHORA = new Date("2026-10-17T12:00:00.000Z");

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

function sinCredenciales() {
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
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
  control.memberships.set("m-1", { id: "m-1", tenantId: "t-1", googleSub: "g-1", rol: "dueno", permisos: [], estado: "activo" });
}

function pedir(plano?: string) {
  return getResumen(
    ctx("http://x/api/whatsapp/resumen", plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
  );
}

beforeEach(() => {
  // P10-20: la sesión del fixture vence a los 30 días de AHORA; con el reloj
  // real el test se rompía solo al día 30. Fijar solo Date deja vivos los timers.
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  singleSinDb();
  sinCredenciales();
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
  sinCredenciales();
});

describe("DASH-S3 GET /api/whatsapp/resumen", () => {
  it("sin sesión no deja pasar", async () => {
    expect((await pedir()).status).toBe(403);
  });

  it("con sesión pero sin membership no deja pasar", async () => {
    comercio();
    const plano = sesion("g-2", null);
    expect((await pedir(plano)).status).toBe(403);
  });

  it("devuelve el resumen sin teléfonos y sin_configurar cuando faltan credenciales", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");
    await registrarConsultaBot({ tenantId: "t-1", numeroE164: "+5491155551234", wamid: "w-1", ahoraMs: Date.now() });
    const r = await pedir(plano);
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["consultas_hoy", "numero_central", "ultima_consulta_en"]);
    expect(body["consultas_hoy"]).toBe(1);
    expect(typeof body["ultima_consulta_en"]).toBe("string");
    expect(body["numero_central"]).toEqual({
      estado: "sin_configurar",
      texto: "Sin configurar: el número central de WhatsApp todavía no está dado de alta, el bot no responde.",
    });
    expect(JSON.stringify(body)).not.toContain("+5491155551234");
  });

  it("con credenciales y último envío fallido el estado es degradado", async () => {
    comercio();
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_TOKEN = "tok";
    registrarEnvioCloud(false, Date.now());
    const plano = sesion("g-1", "t-1");
    const body = (await (await pedir(plano)).json()) as { numero_central: { estado: string; texto: string } };
    expect(body.numero_central.estado).toBe("degradado");
    expect(body.numero_central.texto).toContain("Degradado");
  });
});
