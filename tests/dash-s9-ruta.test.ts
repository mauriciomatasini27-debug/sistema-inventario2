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
      return { texto: "Hay $ 2.500,00 en caja.", tokensEntrada: 3, tokensSalida: 2 };
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
const CUPO = 100;

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

function pedir(plano: string, body: string | Record<string, unknown>) {
  return POST(
    ctx("http://x/api/asistente", {
      headers: { cookie: `__Host-sesion=${plano}` },
      body,
    }),
  );
}

function consultar(plano: string) {
  return GET(
    ctx("http://x/api/asistente", {
      headers: { cookie: `__Host-sesion=${plano}` },
    }),
  );
}

async function activarPlan(planId: "basico" | "plus" | "pro") {
  await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId });
}

async function sembrarUso(cantidad: number): Promise<void> {
  const registro = crearRegistroUsoIA();
  const mes = mesAR();
  for (let i = 0; i < cantidad; i += 1) {
    await registro.registrar({ tenantId: "t-1", mes, tokensEntrada: 1, tokensSalida: 1, costoCentavos: 0 });
  }
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

describe("DASH-S9 GET /api/asistente: medidor de cupo", () => {
  it("con cupo agotado trae usado, restante 0 y reinicio el 1 del mes siguiente", async () => {
    comercio();
    await activarPlan("plus");
    await sembrarUso(CUPO);

    const body = (await (await consultar(sesion("g-1", "t-1"))).json()) as Record<string, unknown>;
    expect(body["cupo"]).toMatchObject({
      usado: CUPO,
      cupo: CUPO,
      restante: 0,
      agotado: true,
      reinicia_el: "2026-11-01",
    });
    expect(String((body["cupo"] as Record<string, unknown>)["explicacion"])).toContain("1/11");
  });

  it("con uso 3 de 100 trae usado 3 y restante 97", async () => {
    comercio();
    await activarPlan("plus");
    await sembrarUso(3);

    const body = (await (await consultar(sesion("g-1", "t-1"))).json()) as Record<string, unknown>;
    expect(body["cupo"]).toMatchObject({ usado: 3, cupo: CUPO, restante: 97, agotado: false });
  });

  it("un empleado también recibe el medidor del comercio", async () => {
    comercio();
    await activarPlan("plus");
    await sembrarUso(3);

    const body = (await (await consultar(sesion("g-3", "t-1"))).json()) as Record<string, unknown>;
    expect(body["incluido"]).toBe(true);
    expect(body["cupo"]).toMatchObject({ usado: 3, cupo: CUPO, restante: 97 });
  });

  it("sin plan incluido no inventa un medidor", async () => {
    comercio();
    await activarPlan("basico");

    const body = (await (await consultar(sesion("g-1", "t-1"))).json()) as Record<string, unknown>;
    expect(body["incluido"]).toBe(false);
    expect(body).not.toHaveProperty("cupo");
  });
});

describe("DASH-S9 POST /api/asistente: sin cupo", () => {
  it("responde 429 con codigo sin_cupo, fecha de reinicio y no llama al LLM", async () => {
    comercio();
    await activarPlan("plus");
    await sembrarUso(CUPO);

    const r = await pedir(sesion("g-1", "t-1"), { pregunta: "¿Cuánto hay en caja?" });
    expect(r.status).toBe(429);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["codigo"]).toBe("sin_cupo");
    expect(body["reinicia_el"]).toBe("2026-11-01");
    expect(String(body["error"])).toContain("1/11");
    expect(String(body["texto"])).toContain("1/11");
    expect(mocks.espia.llamadas).toBe(0);
    expect((await crearRegistroUsoIA().usoDelMes("t-1", mesAR())).consultas).toBe(CUPO);
  });
});
