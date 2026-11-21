import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { resetAdmin } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { gateTenantDatos, MENSAJE_SUSPENDIDO, tenantPorDefecto } from "../src/lib/tenant-context.js";
import { MENSAJE_LOGIN_SUSPENDIDO } from "../src/modules/auth/mensaje-ingreso.js";
import { GET as getLogin } from "../src/pages/api/auth/login.js";
import { GET as getHaciaGoogle } from "../src/pages/api/auth/hacia-google.js";
import { GET as getCallback } from "../src/pages/api/auth/callback.js";
import { GET as getTenants, POST as postTenants } from "../src/pages/api/admin/tenants.js";
import { POST as postSuspender } from "../src/pages/api/admin/mora/suspender.js";
import { fechaAR, sumarDiasAR } from "../src/lib/fecha-ar.js";
import * as controlDb from "../src/lib/control-db.js";

vi.mock("../src/modules/auth/oidc.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/modules/auth/oidc.js")>();
  return {
    ...mod,
    intercambiarCodigo: async () => ({ idToken: "fake" }),
    verificarIdToken: async () => ({ sub: "dueno-s", email: "d@x.com", emailVerificado: true, nombre: "D" }),
  };
});

function sesion(sub: string, reauthAt: string | undefined, tenantId: string | null = null): string {
  const c = crearSesion({ googleSub: sub, tenantId, ahora: new Date() });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: new Date().toISOString(),
    reauthAt,
  });
  return c.idPlano;
}

function venceHace(dias: number): string {
  return `${sumarDiasAR(fechaAR(), -dias)}T00:00:00.000Z`;
}

function tenant(id: string, estado: "activo" | "suspendido", trialHasta?: string, suspensionTipo?: "mora" | "abuso") {
  control.tenants.set(id, {
    id, nombreComercio: "K " + id, slug: id, estado, plan: "base", moneda: "ARS",
    ownerGoogleSub: "dueno-s", esDemo: false, trialHasta, suspensionTipo,
  });
}

function post(url: string, plano: string, body: Record<string, unknown>) {
  return ctx(url, { method: "POST", body, headers: { cookie: `__Host-sesion=${plano}` } });
}

const suspender = (id: string) => ({ tenant_id: id, accion: "suspender", confirmo_id: id, motivo: "mora" });

beforeEach(() => {
  resetStore();
  resetAdmin();
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
  delete process.env.CONTROL_DATABASE_URL;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CONTROL_DATABASE_URL;
});

describe("fase 1: reauth en mutantes admin", () => {
  it("sin reauth reciente el POST da 401 reauth_requerida y no toca el tenant; el GET sigue andando", async () => {
    tenant("t1", "activo", venceHace(20));
    const viejo = sesion("admin-1", new Date(Date.now() - 6 * 60_000).toISOString());
    const r = (await postTenants(post("http://x/api/admin/tenants", viejo, suspender("t1")))) as Response;
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ codigo: "reauth_requerida", reauth_url: "/api/auth/reauth?continuar=/admin" });
    expect(control.tenants.get("t1")?.estado).toBe("activo");
    const g = (await getTenants(ctx("http://x/api/admin/tenants", { headers: { cookie: `__Host-sesion=${viejo}` } }))) as Response;
    expect(g.status).toBe(200);
  });

  it("con reauth reciente el mismo POST pasa", async () => {
    tenant("t1", "activo", venceHace(20));
    const fresco = sesion("admin-1", new Date().toISOString());
    const r = (await postTenants(post("http://x/api/admin/tenants", fresco, suspender("t1")))) as Response;
    expect(r.status).toBe(200);
  });
});

describe("fase 1: una sola regla de suspensión (gracia 14 días)", () => {
  it.each([
    ["tenants", postTenants, "http://x/api/admin/tenants"],
    ["mora", postSuspender, "http://x/api/admin/mora/suspender"],
  ] as const)("%s: en gracia (día 14) responde 409 y no suspende; día 15 suspende", async (_n, ruta, url) => {
    const plano = sesion("admin-1", new Date().toISOString());
    tenant("gracia", "activo", venceHace(14));
    tenant("vencido", "activo", venceHace(15));
    const g = (await ruta(post(url, plano, suspender("gracia")))) as Response;
    expect(g.status).toBe(409);
    expect(control.tenants.get("gracia")?.estado).toBe("activo");
    const v = (await ruta(post(url, plano, suspender("vencido")))) as Response;
    expect(v.status).toBe(200);
    expect(control.tenants.get("vencido")?.estado).toBe("suspendido");
  });

  it("sin vencimiento no se puede suspender", async () => {
    const plano = sesion("admin-1", new Date().toISOString());
    tenant("sin", "activo");
    const r = (await postTenants(post("http://x/api/admin/tenants", plano, suspender("sin")))) as Response;
    expect(r.status).toBe(409);
  });

  it("si la base no guarda el estado responde 503 y revierte la memoria", async () => {
    process.env.CONTROL_DATABASE_URL = "postgres://nadie@127.0.0.1:1/no";
    vi.spyOn(controlDb, "persistirEstadoTenant").mockResolvedValue(false);
    vi.spyOn(controlDb, "listarYSincronizarTenantsControl").mockResolvedValue(0);
    const plano = sesion("admin-1", new Date().toISOString());
    tenant("t1", "activo", venceHace(20));
    const r = (await postTenants(post("http://x/api/admin/tenants", plano, suspender("t1")))) as Response;
    expect(r.status).toBe(503);
    expect(control.tenants.get("t1")?.estado).toBe("activo");
  });
});

describe("fase 1: suspendido queda en solo lectura", () => {
  it("escritura del plano de datos 403 con mensaje; lectura pasa; activo escribe", () => {
    const id = tenantPorDefecto();
    tenant(id, "suspendido");
    const w = gateTenantDatos(new Request("http://x/api/sales", { method: "POST" }), "/api/sales");
    expect(w?.ok).toBe(false);
    const r = gateTenantDatos(new Request("http://x/api/products", { method: "GET" }), "/api/products");
    expect(r?.ok).toBe(true);
    tenant(id, "activo");
    expect(gateTenantDatos(new Request("http://x/api/sales", { method: "POST" }), "/api/sales")?.ok).toBe(true);
  });

  it("el 403 trae el texto de cuenta suspendida", async () => {
    tenant(tenantPorDefecto(), "suspendido", undefined, "mora");
    const w = gateTenantDatos(new Request("http://x/api/sales", { method: "PATCH" }), "/api/sales");
    if (!w || w.ok) throw new Error("debía cortar");
    expect(w.respuesta.status).toBe(403);
    expect(await w.respuesta.json()).toEqual({ error: MENSAJE_SUSPENDIDO });
  });

  it("el login de un miembro de comercio suspendido vuelve a la landing con el mensaje y sin sesión", async () => {
    process.env.GOOGLE_LOGIN_CLIENT_ID = "c";
    process.env.GOOGLE_LOGIN_CLIENT_SECRET = "s";
    process.env.GOOGLE_LOGIN_REDIRECT = "http://x/api/auth/callback";
    tenant("t-s", "suspendido", undefined, "mora");
    control.memberships.set("m1", { id: "m1", tenantId: "t-s", googleSub: "dueno-s", rol: "dueno", permisos: [], estado: "activo" });
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const cookies = (rLogin.headers as Headers & { getSetCookie: () => string[] }).getSetCookie();
    const jar = cookies.map((c) => c.split(";")[0]).join("; ");
    await getHaciaGoogle(ctx("http://x/api/auth/hacia-google", { headers: { cookie: jar } }));
    const state = decodeURIComponent(jar.match(/__Host-oauth-state=([^;]+)/)?.[1] ?? "");
    const rCb = await getCallback(
      ctx(`http://x/api/auth/callback?code=C&state=${state}`, { headers: { cookie: jar, accept: "text/html" } }),
    );
    expect(rCb.status).toBe(302);
    expect(rCb.headers.get("Location")).toBe(`/?ingreso=error&mensaje=${encodeURIComponent(MENSAJE_LOGIN_SUSPENDIDO)}`);
    expect([...control.sessions.values()].some((s) => s.googleSub === "dueno-s")).toBe(false);
  });
});

describe("fase 1: seed dev con vencimiento", () => {
  it("vencido_hace_dias deja el tenant control-app vencido; sin el parámetro, sin vencimiento", async () => {
    const { sembrarControlApp } = await import("../src/lib/control-app-dev.js");
    await sembrarControlApp(20);
    expect(control.tenants.get("control-app")?.trialHasta?.slice(0, 10)).toBe(sumarDiasAR(fechaAR(), -20));
    await sembrarControlApp();
    expect(control.tenants.get("control-app")?.trialHasta).toBeUndefined();
  });
});
