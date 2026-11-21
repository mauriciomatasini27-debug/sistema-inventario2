import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { adminStore, resetAdmin } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { gateTenantDatos, MENSAJE_SUSPENDIDO_NEUTRO, tenantPorDefecto } from "../src/lib/tenant-context.js";
import { MENSAJE_LOGIN_SUSPENDIDO_NEUTRO } from "../src/modules/auth/mensaje-ingreso.js";
import { GET as getLogin } from "../src/pages/api/auth/login.js";
import { GET as getHaciaGoogle } from "../src/pages/api/auth/hacia-google.js";
import { GET as getCallback } from "../src/pages/api/auth/callback.js";
import { GET as getTenants, POST as postTenants } from "../src/pages/api/admin/tenants.js";

vi.mock("../src/modules/auth/oidc.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/modules/auth/oidc.js")>();
  return {
    ...mod,
    intercambiarCodigo: async () => ({ idToken: "fake" }),
    verificarIdToken: async () => ({ sub: "dueno-a", email: "a@x.com", emailVerificado: true, nombre: "A" }),
  };
});

function sesion(sub: string, reauthAt: string | undefined): string {
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora: new Date() });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash, googleSub: sub, tenantId: null,
    expiraAt: c.registro.expiraAt, expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: new Date().toISOString(), reauthAt,
  });
  return c.idPlano;
}

function tenantSinVencimiento(id: string) {
  control.tenants.set(id, {
    id, nombreComercio: "K " + id, slug: id, estado: "activo", plan: "base", moneda: "ARS",
    ownerGoogleSub: "dueno-a", esDemo: false,
  });
}

const post = (plano: string, body: Record<string, unknown>) =>
  postTenants(ctx("http://x/api/admin/tenants", { method: "POST", body, headers: { cookie: `__Host-sesion=${plano}` } })) as Promise<Response>;
const abuso = (id: string, extra: Record<string, unknown> = {}) => ({ tenant_id: id, accion: "suspender_abuso", confirmo_id: id, motivo: "spam masivo", ...extra });

beforeEach(() => {
  resetStore();
  resetAdmin();
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
  delete process.env.CONTROL_DATABASE_URL;
});

describe("fase 2: suspensión por abuso", () => {
  it("suspende ya, sin vencimiento ni gracia, y deja auditado que fue abuso", async () => {
    const id = tenantPorDefecto();
    tenantSinVencimiento(id);
    const r = await post(sesion("admin-1", new Date().toISOString()), abuso(id));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ estado: "suspendido", tipo: "abuso" });
    expect(control.tenants.get(id)).toMatchObject({ estado: "suspendido", suspensionTipo: "abuso" });
    expect(adminStore.actos.at(-1)).toMatchObject({ actoKind: "suspension_abuso", tenantId: id });
    expect(adminStore.eventosVida.at(-1)?.motivo).toBe("abuso: spam masivo");
  });

  it("pide motivo, el id escrito y reauth reciente", async () => {
    tenantSinVencimiento("t1");
    const fresco = sesion("admin-1", new Date().toISOString());
    expect((await post(fresco, abuso("t1", { motivo: "" }))).status).toBe(422);
    expect((await post(fresco, abuso("t1", { confirmo_id: "otro" }))).status).toBe(422);
    const viejo = sesion("admin-1", new Date(Date.now() - 6 * 60_000).toISOString());
    expect((await post(viejo, abuso("t1"))).status).toBe(401);
    expect(control.tenants.get("t1")?.estado).toBe("activo");
  });

  it("el comercio ve un texto neutro, sin 'falta de pago', al escribir y al entrar", async () => {
    const id = tenantPorDefecto();
    tenantSinVencimiento(id);
    await post(sesion("admin-1", new Date().toISOString()), abuso(id));
    const w = gateTenantDatos(new Request("http://x/api/sales", { method: "POST" }), "/api/sales");
    if (!w || w.ok) throw new Error("debía cortar");
    const cuerpo = (await w.respuesta.json()) as { error: string };
    expect(cuerpo.error).toBe(MENSAJE_SUSPENDIDO_NEUTRO);
    expect(cuerpo.error).not.toContain("pago");

    process.env.GOOGLE_LOGIN_CLIENT_ID = "c";
    process.env.GOOGLE_LOGIN_CLIENT_SECRET = "s";
    process.env.GOOGLE_LOGIN_REDIRECT = "http://x/api/auth/callback";
    control.memberships.set("m1", { id: "m1", tenantId: id, googleSub: "dueno-a", rol: "dueno", permisos: [], estado: "activo" });
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const jar = (rLogin.headers as Headers & { getSetCookie: () => string[] }).getSetCookie().map((c) => c.split(";")[0]).join("; ");
    await getHaciaGoogle(ctx("http://x/api/auth/hacia-google", { headers: { cookie: jar } }));
    const state = decodeURIComponent(jar.match(/__Host-oauth-state=([^;]+)/)?.[1] ?? "");
    const rCb = await getCallback(ctx(`http://x/api/auth/callback?code=C&state=${state}`, { headers: { cookie: jar, accept: "text/html" } }));
    expect(rCb.headers.get("Location")).toBe(`/?ingreso=error&mensaje=${encodeURIComponent(MENSAJE_LOGIN_SUSPENDIDO_NEUTRO)}`);
  });

  it("suspendido sin tipo conocido (proceso reiniciado) usa el texto neutro", async () => {
    const id = tenantPorDefecto();
    tenantSinVencimiento(id);
    control.tenants.get(id)!.estado = "suspendido";
    const w = gateTenantDatos(new Request("http://x/api/sales", { method: "POST" }), "/api/sales");
    if (!w || w.ok) throw new Error("debía cortar");
    expect(await w.respuesta.json()).toEqual({ error: MENSAJE_SUSPENDIDO_NEUTRO });
  });

  it("reactivar limpia el tipo y vuelve a dejar escribir; el listado muestra el tipo", async () => {
    const id = tenantPorDefecto();
    tenantSinVencimiento(id);
    const plano = sesion("admin-1", new Date().toISOString());
    await post(plano, abuso(id));
    const g = (await getTenants(ctx("http://x/api/admin/tenants", { headers: { cookie: `__Host-sesion=${plano}` } }))) as Response;
    const lista = (await g.json()) as { tenants: Array<Record<string, unknown>> };
    expect(lista.tenants[0]).toMatchObject({ estado: "suspendido", suspension_tipo: "abuso" });
    expect(lista.tenants[0]).not.toHaveProperty("backup");
    const r = await post(plano, { tenant_id: id, accion: "reactivar", confirmo_id: id, motivo: "aclarado" });
    expect(r.status).toBe(200);
    expect(control.tenants.get(id)?.suspensionTipo).toBeUndefined();
    expect(gateTenantDatos(new Request("http://x/api/sales", { method: "POST" }), "/api/sales")?.ok).toBe(true);
  });
});
