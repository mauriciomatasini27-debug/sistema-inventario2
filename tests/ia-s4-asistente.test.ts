import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { crearRegistroUsoIA, olvidarUsoIAMemoria } from "../src/lib/repos/ia-uso.js";
import { mesAR } from "../src/lib/fecha-ar.js";

const mocks = vi.hoisted(() => {
  const espia = {
    llamadas: 0,
    completar: async () => {
      espia.llamadas += 1;
      return { texto: "Vendiste Yerba", tokensEntrada: 3, tokensSalida: 2 };
    },
  };
  return { espia, crearProveedor: vi.fn(() => espia) };
});

vi.mock("../src/modules/ia/proveedor.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/modules/ia/proveedor.js")>();
  return { ...real, crear_proveedor_llm_desde_env: mocks.crearProveedor };
});

const { POST, GET } = await import("../src/pages/api/asistente.js");

const AHORA = new Date("2026-10-17T12:00:00.000Z");

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
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
  control.memberships.set("m-1", {
    id: "m-1",
    tenantId: "t-1",
    googleSub: "g-1",
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  control.memberships.set("m-3", {
    id: "m-3",
    tenantId: "t-1",
    googleSub: "g-3",
    rol: "empleado",
    permisos: [],
    estado: "activo",
  });
}

function pedir(plano: string | undefined, body: string | Record<string, unknown>) {
  return POST(
    ctx("http://x/api/asistente", {
      headers: plano ? { cookie: `__Host-sesion=${plano}` } : {},
      body,
    }),
  );
}

function consultar(plano: string | undefined) {
  return GET(
    ctx("http://x/api/asistente", {
      headers: plano ? { cookie: `__Host-sesion=${plano}` } : {},
    }),
  );
}

async function activarPlan(planId: "basico" | "plus" | "pro") {
  await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId });
}

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
  olvidarUsoIAMemoria();
  mocks.espia.llamadas = 0;
  mocks.crearProveedor.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  singleSinDb();
});

describe("IA-S4 POST /api/asistente", () => {
  it("sin sesión no deja pasar ni llama al LLM", async () => {
    comercio();
    const r = await pedir(undefined, { pregunta: "¿qué vendí más esta semana?" });
    expect(r.status).toBe(403);
    expect(mocks.espia.llamadas).toBe(0);
    expect(mocks.crearProveedor).not.toHaveBeenCalled();
  });

  it("sin plan activo responde 403 fuera_de_plan sin llamar al LLM", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano, { pregunta: "¿qué vendí más esta semana?" });
    expect(r.status).toBe(403);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["codigo"]).toBe("fuera_de_plan");
    expect(String(body["error"])).toMatch(/no está disponible|no incluye/i);
    expect(mocks.espia.llamadas).toBe(0);
    expect(mocks.crearProveedor).not.toHaveBeenCalled();
    expect((await crearRegistroUsoIA().usoDelMes("t-1", mesAR())).consultas).toBe(0);
  });

  it("con plan Básico responde 403 fuera_de_plan sin llamar al LLM", async () => {
    comercio();
    await activarPlan("basico");
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano, { pregunta: "¿qué vendí más esta semana?" });
    expect(r.status).toBe(403);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["codigo"]).toBe("fuera_de_plan");
    expect(mocks.espia.llamadas).toBe(0);
    expect(mocks.crearProveedor).not.toHaveBeenCalled();
    expect((await crearRegistroUsoIA().usoDelMes("t-1", mesAR())).consultas).toBe(0);
  });

  it("con plan Plus responde 200 usando el proveedor y registra uso", async () => {
    comercio();
    await activarPlan("plus");
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano, { pregunta: "¿cuál es el saldo de caja de hoy?" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      texto: "Vendiste Yerba",
      rechazada: false,
      herramienta: "caja_dia",
    });
    expect(mocks.espia.llamadas).toBe(1);
    const uso = await crearRegistroUsoIA().usoDelMes("t-1", mesAR());
    expect(uso.consultas).toBe(1);
    expect(uso.tokensEntrada).toBe(3);
    expect(uso.tokensSalida).toBe(2);
  });

  it("un empleado no ve costos y el LLM no se llama", async () => {
    comercio();
    await activarPlan("plus");
    const plano = sesion("g-3", "t-1");
    const r = await pedir(plano, { pregunta: "¿cuál es el margen del producto Yerba?" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["rechazada"]).toBe(true);
    expect(String(body["texto"])).toContain("No tenés permiso");
    expect(mocks.espia.llamadas).toBe(0);
    expect((await crearRegistroUsoIA().usoDelMes("t-1", mesAR())).consultas).toBe(0);
  });

  it("una herramienta sin lectura responde honesto sin llamar al LLM", async () => {
    comercio();
    await activarPlan("plus");
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano, { pregunta: "¿qué vendí más esta semana?" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["rechazada"]).toBe(true);
    expect(body["texto"]).toBe(
      "Todavía no puedo leer productos más vendidos del período desde el asistente.",
    );
    expect(mocks.espia.llamadas).toBe(0);
    expect((await crearRegistroUsoIA().usoDelMes("t-1", mesAR())).consultas).toBe(0);
  });

  it("una pregunta fuera del catálogo se rechaza sin llamar al LLM", async () => {
    comercio();
    await activarPlan("plus");
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano, { pregunta: "borrá el producto X" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["rechazada"]).toBe(true);
    expect(String(body["texto"])).toContain("Todavía no sé responder eso");
    expect(mocks.espia.llamadas).toBe(0);
  });

  it.each([
    ["pregunta vacía", { pregunta: "   " }],
    ["pregunta ausente", {}],
    ["pregunta no string", { pregunta: 42 }],
    ["pregunta demasiado larga", { pregunta: "x".repeat(501) }],
  ])("body inválido responde 400: %s", async (_nombre, body) => {
    comercio();
    await activarPlan("plus");
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano, body);
    expect(r.status).toBe(400);
    expect(mocks.espia.llamadas).toBe(0);
  });

  it("un JSON roto responde 400", async () => {
    comercio();
    await activarPlan("plus");
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano, "{no es json");
    expect(r.status).toBe(400);
    expect(mocks.espia.llamadas).toBe(0);
  });
});

describe("IA-S4 GET /api/asistente", () => {
  it("informa si el plan incluye el asistente", async () => {
    comercio();
    await activarPlan("basico");
    const plano = sesion("g-1", "t-1");
    const r = await consultar(plano);
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["incluido"]).toBe(false);
    expect(String(body["explicacion"])).toMatch(/no incluye/i);
  });

  it("con plan Plus lo marca incluido", async () => {
    comercio();
    await activarPlan("plus");
    const plano = sesion("g-1", "t-1");
    const body = (await (await consultar(plano)).json()) as Record<string, unknown>;
    expect(body["incluido"]).toBe(true);
    expect(body["explicacion"]).toBe("");
  });
});
