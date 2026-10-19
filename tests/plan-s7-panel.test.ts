import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { registrarConsultaBot } from "../src/lib/repos/bot-consultas.js";
import { fechaAR, parseFechaAR } from "../src/lib/fecha-ar.js";
import { PLANES_EJEMPLO } from "../src/modules/planes/catalogo.js";
import { vistaPlan } from "../src/lib/plan-panel.js";
import { GET as getPlan } from "../src/pages/api/plan/resumen.js";

const HOY = new Date("2026-10-18T12:00:00.000Z");
const hoy = fechaAR(HOY);
const renovacion = parseFechaAR("2026-11-18")!;

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
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
    googleSub: "g-3",
    rol: "empleado",
    permisos: [],
    estado: "activo",
  });
}

function sesion(sub: string, tenantId: string | null): string {
  const c = crearSesion({ googleSub: sub, tenantId, ahora: HOY });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: HOY.toISOString(),
  });
  return c.idPlano;
}

// Consultas del bot por WhatsApp (whatsapp_usage tipo consulta), la misma
// fuente que la tarjeta `Bot`; una del mes anterior en hora AR no cuenta.
async function consultasBot(cantidad: number) {
  for (let i = 0; i < cantidad; i++) {
    await registrarConsultaBot({
      tenantId: "t-1",
      numeroE164: "+5491100000000",
      wamid: `wamid.${i}`,
      ahoraMs: HOY.getTime() - i * 60_000,
    });
  }
  await registrarConsultaBot({
    tenantId: "t-1",
    numeroE164: "+5491100000000",
    wamid: "wamid.0",
    ahoraMs: HOY.getTime(),
  });
  await registrarConsultaBot({
    tenantId: "t-1",
    numeroE164: "+5491100000000",
    wamid: "wamid.septiembre",
    ahoraMs: Date.parse("2026-10-01T02:30:00.000Z"),
  });
}

function pedir(plano: string) {
  return getPlan(
    ctx("http://x/api/plan/resumen", {
      headers: { cookie: `__Host-sesion=${plano}` },
    }),
  );
}

function vista(planId: "basico" | "plus" | "pro" | null, mensajesWhatsappMes: number) {
  return vistaPlan({
    planId,
    catalogo: PLANES_EJEMPLO,
    consultasAsistenteMes: 0,
    mensajesWhatsappMes,
    hoy,
    renovacion,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: HOY, toFake: ["Date"] });
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
});

afterEach(() => {
  vi.useRealTimers();
  singleSinDb();
});

describe("PLAN-S7 núcleo: renovación, cupo de WhatsApp y planes", () => {
  it("expone la fecha de renovación y los otros planes del catálogo", () => {
    const v = vista("plus", 0);
    expect(v.renovacion).toBe("2026-11-18");
    expect(v.otros_planes).toEqual([
      { id: "basico", nombre: "Básico" },
      { id: "pro", nombre: "Pro" },
    ]);
  });

  it("Básico informa el cupo de WhatsApp con usado, cupo y restante", () => {
    const v = vista("basico", 42);
    expect(v.whatsapp).toMatchObject({
      incluido: true,
      usado: 42,
      cupo: 100,
      restante: 58,
      sin_techo: false,
      agotado: false,
      porcentaje: 42,
      reinicia_el: "2026-11-01",
    });
  });

  it("si el cupo se pasa, el restante queda en 0 y no negativo", () => {
    const v = vista("basico", 130);
    expect(v.whatsapp.usado).toBe(130);
    expect(v.whatsapp.cupo).toBe(100);
    expect(v.whatsapp.restante).toBe(0);
    expect(v.whatsapp.porcentaje).toBe(100);
    expect(v.whatsapp.agotado).toBe(true);
  });

  it("sin techo definido lo dice en texto y no inventa un cupo", () => {
    const v = vista("plus", 7);
    expect(v.whatsapp).toMatchObject({
      incluido: true,
      usado: 7,
      cupo: null,
      restante: null,
      sin_techo: true,
      agotado: false,
      porcentaje: 0,
    });
    expect(v.whatsapp.explicacion).toContain("sin techo definido");
  });

  it("sin plan activo el WhatsApp no está incluido", () => {
    const v = vista(null, 0);
    expect(v.whatsapp.incluido).toBe(false);
    expect(v.whatsapp.explicacion).toContain("Sin plan activo");
    expect(v.otros_planes.map((p) => p.id)).toEqual(["basico", "plus", "pro"]);
  });
});

describe("PLAN-S7 GET /api/plan/resumen: solo Dueño y cupos", () => {
  it("el empleado recibe 403 sin datos del plan", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({
      tenantId: "t-1",
      planId: "plus",
    });
    const plano = sesion("g-3", "t-1");
    const r = await pedir(plano);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({
      error: "Solo el Dueño puede ver el plan.",
    });
  });

  it("el Dueño ve la renovación y el cupo de WhatsApp usado en el mes", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({
      tenantId: "t-1",
      planId: "basico",
    });
    await consultasBot(42);
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano);
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      renovacion: string;
      whatsapp: Record<string, unknown>;
      otros_planes: Array<{ id: string; nombre: string }>;
    };
    expect(body.renovacion).toBe("2026-11-18");
    expect(body.whatsapp).toEqual({
      incluido: true,
      usado: 42,
      cupo: 100,
      restante: 58,
      sin_techo: false,
      agotado: false,
      porcentaje: 42,
      reinicia_el: "2026-11-01",
      explicacion: "",
    });
    expect(body.otros_planes).toEqual([
      { id: "plus", nombre: "Plus" },
      { id: "pro", nombre: "Pro" },
    ]);
  });

  it("con un plan sin techo el Dueño ve 'sin techo definido'", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({
      tenantId: "t-1",
      planId: "plus",
    });
    await consultasBot(7);
    const plano = sesion("g-1", "t-1");
    const body = (await (await pedir(plano)).json()) as {
      whatsapp: Record<string, unknown>;
    };
    expect(body.whatsapp).toMatchObject({
      usado: 7,
      cupo: null,
      restante: null,
      sin_techo: true,
    });
    expect(String(body.whatsapp["explicacion"])).toContain("sin techo definido");
  });
});
