import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { crearRegistroUsoIA, olvidarUsoIAMemoria } from "../src/lib/repos/ia-uso.js";
import { mesAR } from "../src/lib/fecha-ar.js";
import { GET as getPlan } from "../src/pages/api/plan/resumen.js";

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
}

function pedir(plano?: string) {
  return getPlan(ctx("http://x/api/plan/resumen", plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}));
}

async function usar(consultas: number) {
  const mes = mesAR();
  const registro = crearRegistroUsoIA();
  for (let i = 0; i < consultas; i++) {
    await registro.registrar({ tenantId: "t-1", mes, tokensEntrada: 1, tokensSalida: 1, costoCentavos: 0 });
  }
}

function mesSiguiente(mes: string): string {
  const anio = Number(mes.slice(0, 4));
  const n = Number(mes.slice(5, 7));
  return n === 12 ? `${anio + 1}-01-01` : `${anio}-${String(n + 1).padStart(2, "0")}-01`;
}

beforeEach(() => {
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
  olvidarUsoIAMemoria();
});

afterEach(() => {
  singleSinDb();
});

describe("DASH-S8 GET /api/plan/resumen", () => {
  it("sin sesión no deja pasar", async () => {
    expect((await pedir()).status).toBe(403);
  });

  it("con sesión pero sin membership no deja pasar", async () => {
    comercio();
    const plano = sesion("g-2", null);
    expect((await pedir(plano)).status).toBe(403);
  });

  it("sin plan activo responde la vista vacía sin precios", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano);
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body["plan_id"]).toBeNull();
    expect(body["nombre"]).toBe("Sin plan activo");
    const asistente = body["asistente"] as Record<string, unknown>;
    expect(asistente["incluido"]).toBe(false);
    expect(String(asistente["explicacion"])).toContain("Sin plan activo");
    expect(JSON.stringify(body)).not.toMatch(/\$\s*\d/);
    expect(JSON.stringify(body)).not.toContain("precio");
  });

  it("con plan Plus y uso devuelve usado, restante y porcentaje", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    await usar(37);
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { nombre: string; asistente: Record<string, unknown>; features: Array<{ clave: string; incluida: boolean }> };
    expect(body.nombre).toBe("Plus");
    expect(body.asistente).toMatchObject({
      incluido: true,
      usado: 37,
      cupo: 100,
      restante: 63,
      agotado: false,
      porcentaje: 37,
      reinicia_el: mesSiguiente(mesAR()),
    });
    expect(body.features.find((f) => f.clave === "asistente_ia")?.incluida).toBe(true);
  });

  it("con cupo agotado marca agotado y explica el reinicio", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    await usar(100);
    const plano = sesion("g-1", "t-1");
    const body = (await (await pedir(plano)).json()) as { asistente: Record<string, unknown> };
    expect(body.asistente["agotado"]).toBe(true);
    expect(body.asistente["restante"]).toBe(0);
    expect(String(body.asistente["explicacion"])).toContain("Llegaste al cupo del mes");
  });

  it("plan Básico no incluye el asistente y lo explica con el nombre del plan", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    await usar(5);
    const plano = sesion("g-1", "t-1");
    const body = (await (await pedir(plano)).json()) as { nombre: string; asistente: Record<string, unknown> };
    expect(body.nombre).toBe("Básico");
    expect(body.asistente["incluido"]).toBe(false);
    expect(String(body.asistente["explicacion"])).toContain("Básico");
    expect(String(body.asistente["explicacion"])).toContain("no incluye");
  });

  it("en multi sin base del comercio responde 503 base_no_disponible", async () => {
    comercio();
    process.env.TENANT_MODE = "multi";
    const plano = sesion("g-1", "t-1");
    const r = await pedir(plano);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "base_no_disponible" });
  });
});
