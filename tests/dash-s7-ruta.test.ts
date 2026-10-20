import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { crearRegistroUsoIA, olvidarUsoIAMemoria } from "../src/lib/repos/ia-uso.js";
import { mesAR } from "../src/lib/fecha-ar.js";
import { crear_catalogo } from "../src/modules/ia/asistente.js";
import { crearLecturasIA } from "../src/lib/repos/ia-lecturas.js";

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
const FUERA_CATALOGO =
  "Todavía no sé responder eso. Probá con una de las preguntas sugeridas.";

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

function sembrarVentaTop() {
  store.productos.set("A-1", {
    sku: "A-1",
    nombre: "Yerba",
    precioCentavos: 1000,
    sector: "general",
    locationId: null,
    archivado: false,
    controlaVencimiento: false,
    estado: "activo",
    minStock: null,
    reorderQty: null,
  });
  store.prices.set("A-1", 1000);
  store.stock.set("A-1", 8);
  store.ticketLineas.push({ sale_id: "s-1", product_id: "A-1", qty: 4, precio_centavos: "1000" });
  store.ticketDescuentos.push({
    sale_id: "s-1",
    linea_idx: 0,
    sku: "A-1",
    bruto_centavos: "4000",
    desc_linea_centavos: "0",
    desc_ticket_centavos: "0",
    neto_centavos: "4000",
  });
}

function sembrarCaja() {
  store.movements.push({
    id: "mv-1",
    tipo: "ingreso",
    metodo: "Efectivo",
    monto_centavos: "250000",
    origen: "venta",
    idempotency_key: "dash-s7-caja",
  });
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

describe("DASH-S7 GET /api/asistente", () => {
  it("con plan incluido suma 12 preguntas sugeridas, una por cada una de las 8 herramientas primero", async () => {
    comercio();
    await activarPlan("plus");
    const body = (await (await consultar(sesion("g-1", "t-1"))).json()) as Record<string, unknown>;
    const preguntas = body["preguntas"] as Array<{ texto: string; herramienta: string }>;
    expect(body["incluido"]).toBe(true);
    expect(preguntas).toHaveLength(12);
    expect(new Set(preguntas.map((p) => p.herramienta)).size).toBe(8);
    expect(preguntas[0]).toEqual({ texto: "¿Qué productos se vendieron más este mes?", herramienta: "top_productos" });
  });

  it("un empleado no recibe preguntas de herramientas solo dueño", async () => {
    comercio();
    await activarPlan("plus");
    const body = (await (await consultar(sesion("g-3", "t-1"))).json()) as Record<string, unknown>;
    const preguntas = body["preguntas"] as Array<{ herramienta: string }>;
    const soloDueno = new Set<string>(
      crear_catalogo(crearLecturasIA())
        .filter((h) => h.soloDueno)
        .map((h) => h.nombre),
    );
    expect(preguntas).toHaveLength(12);
    expect(preguntas.every((p) => !soloDueno.has(p.herramienta))).toBe(true);
  });

  it("sin plan incluido no manda preguntas", async () => {
    comercio();
    await activarPlan("basico");
    const body = (await (await consultar(sesion("g-1", "t-1"))).json()) as Record<string, unknown>;
    expect(body["incluido"]).toBe(false);
    expect(body["preguntas"]).toEqual([]);
  });
});

describe("DASH-S7 POST /api/asistente", () => {
  it("fuera de catálogo devuelve la respuesta fija sin llamar al LLM", async () => {
    comercio();
    await activarPlan("plus");
    const r = await pedir(sesion("g-1", "t-1"), { pregunta: "borrá el producto X" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toEqual({ texto: FUERA_CATALOGO, rechazada: true, fueraDeCatalogo: true });
    expect(mocks.espia.llamadas).toBe(0);
    expect((await crearRegistroUsoIA().usoDelMes("t-1", mesAR())).consultas).toBe(0);
  });

  it("top_productos responde con datos reales y ya no dice que no puede leer", async () => {
    comercio();
    await activarPlan("plus");
    sembrarVentaTop();
    const r = await pedir(sesion("g-1", "t-1"), { pregunta: "¿Qué productos se vendieron más este mes?" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      rechazada: false,
      herramienta: "top_productos",
      reporte: { href: "/panel/reportes", etiqueta: "reportes" },
    });
    expect(body["texto"]).not.toContain("Todavía no puedo leer");
    expect(body["cifras"]).toEqual([]);
    expect(mocks.espia.llamadas).toBe(1);
  });

  it("un empleado no puede pedir margen", async () => {
    comercio();
    await activarPlan("plus");
    const r = await pedir(sesion("g-3", "t-1"), { pregunta: "¿Cuál es el margen del producto?" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toEqual({
      texto: "No tenés permiso para ver esa información.",
      rechazada: true,
    });
    expect(mocks.espia.llamadas).toBe(0);
  });

  it("caja_dia devuelve las cifras exactas sembradas y el reporte", async () => {
    comercio();
    await activarPlan("plus");
    sembrarCaja();
    const r = await pedir(sesion("g-1", "t-1"), { pregunta: "¿Cuánto hay en caja?" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      texto: "Hay $ 2.500,00 en caja.",
      rechazada: false,
      herramienta: "caja_dia",
      reporte: { href: "/panel/caja", etiqueta: "caja" },
    });
    expect(body["cifras"]).toContainEqual({ etiqueta: "Total en caja", valor: "$ 2.500,00" });
    expect(body).not.toHaveProperty("datos");
    expect(body).not.toHaveProperty("prompt");
    expect(mocks.espia.llamadas).toBe(1);
  });
});
