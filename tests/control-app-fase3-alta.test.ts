import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { resetAdmin } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { hashToken } from "../src/modules/tenants/invitaciones.js";
import { esOwnerPendiente } from "../src/modules/tenants/alta-admin.js";
import { GET as getTenants } from "../src/pages/api/admin/tenants.js";
import { POST as postAlta } from "../src/pages/api/admin/tenants/alta.js";
import { GET as getLogin } from "../src/pages/api/auth/login.js";
import { GET as getHaciaGoogle } from "../src/pages/api/auth/hacia-google.js";
import { GET as getCallback } from "../src/pages/api/auth/callback.js";

vi.mock("../src/modules/auth/oidc.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/modules/auth/oidc.js")>();
  return {
    ...mod,
    intercambiarCodigo: async () => ({ idToken: "fake" }),
    verificarIdToken: async () => ({
      sub: "dueno-nuevo",
      email: "dueno@kiosco.test",
      emailVerificado: true,
      nombre: "Dueño Nuevo",
    }),
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

const cookie = (plano: string) => ({ headers: { cookie: `__Host-sesion=${plano}` } });

const alta = (plano: string, body: Record<string, unknown>) =>
  postAlta(ctx("http://x/api/admin/tenants/alta", { method: "POST", body, headers: { cookie: `__Host-sesion=${plano}` } })) as Promise<Response>;

beforeEach(() => {
  resetStore();
  resetAdmin();
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
  delete process.env.CONTROL_DATABASE_URL;
});

describe("fase 3: alta de comercio con dueño pendiente", () => {
  it("crea el comercio, arma el slug y deja una invitación de dueño", async () => {
    const r = await alta(sesion("admin-1", new Date().toISOString()), {
      nombre_comercio: "Kiosco Nuevo",
      plan: "plus",
      moneda: "ARS",
      email_dueno: "dueno@kiosco.test",
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as { tenant_id: string; slug: string; email_dueno_pendiente: string; invitacion: { link: string } };
    expect(body.slug).toBe("kiosco-nuevo");
    expect(body.email_dueno_pendiente).toBe("dueno@kiosco.test");
    expect(body.invitacion.link).toContain("invitation_token=");
    const t = control.tenants.get(body.tenant_id);
    expect(t).toMatchObject({ nombreComercio: "Kiosco Nuevo", plan: "plus", estado: "activo" });
    expect(esOwnerPendiente(t?.ownerGoogleSub)).toBe(true);
    const inv = [...control.invitations.values()].find((i) => i.tenantId === body.tenant_id);
    expect(inv).toMatchObject({ rol: "dueno", estado: "pendiente", email: "dueno@kiosco.test" });
  });

  it("pide reauth reciente y un email válido", async () => {
    const fresco = sesion("admin-1", new Date().toISOString());
    expect((await alta(fresco, { nombre_comercio: "AB", plan: "base", email_dueno: "a@b.com" })).status).toBe(422);
    expect((await alta(fresco, { nombre_comercio: "Kiosco Largo", plan: "base", email_dueno: "no-es-mail" })).status).toBe(422);
    const viejo = sesion("admin-1", new Date(Date.now() - 6 * 60_000).toISOString());
    expect((await alta(viejo, { nombre_comercio: "Kiosco Largo", plan: "base", email_dueno: "a@b.com" })).status).toBe(401);
    expect(control.tenants.size).toBe(0);
  });

  it("el listado muestra el email pendiente y no inventa el backup", async () => {
    const plano = sesion("admin-1", new Date().toISOString());
    await alta(plano, { nombre_comercio: "Almacén Sur", plan: "base", email_dueno: "sur@x.com" });
    const g = (await getTenants(ctx("http://x/api/admin/tenants", cookie(plano)))) as Response;
    const lista = (await g.json()) as { tenants: Array<Record<string, unknown>> };
    expect(lista.tenants[0]).toMatchObject({ nombre: "Almacén Sur", email_dueno_pendiente: "sur@x.com" });
    expect(lista.tenants[0]).not.toHaveProperty("backup");
  });

  it("si el slug ya está, le agrega un sufijo", async () => {
    const plano = sesion("admin-1", new Date().toISOString());
    const a = await alta(plano, { nombre_comercio: "Kiosco Sur", plan: "base", email_dueno: "a@x.com" });
    const b = await alta(plano, { nombre_comercio: "Kiosco Sur", plan: "base", email_dueno: "b@x.com" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const ja = (await a.json()) as { slug: string };
    const jb = (await b.json()) as { slug: string };
    expect(ja.slug).toBe("kiosco-sur");
    expect(jb.slug.startsWith("kiosco-sur-")).toBe(true);
    expect(jb.slug).not.toBe(ja.slug);
  });

  it("el dueño, al entrar con ese email, queda atado como dueño", async () => {
    const creado = await alta(sesion("admin-1", new Date().toISOString()), {
      nombre_comercio: "Kiosco Nuevo",
      plan: "base",
      email_dueno: "dueno@kiosco.test",
    });
    const altaBody = (await creado.json()) as { tenant_id: string; invitacion: { link: string } };
    const token = new URL(altaBody.invitacion.link).searchParams.get("invitation_token");
    expect(token).toBeTruthy();

    process.env.GOOGLE_LOGIN_CLIENT_ID = "c";
    process.env.GOOGLE_LOGIN_CLIENT_SECRET = "s";
    process.env.GOOGLE_LOGIN_REDIRECT = "http://x/api/auth/callback";
    const rLogin = await getLogin(ctx(`http://x/api/auth/login?invitation_token=${token}`));
    const jar = (rLogin.headers as Headers & { getSetCookie: () => string[] }).getSetCookie().map((c) => c.split(";")[0]).join("; ");
    await getHaciaGoogle(ctx("http://x/api/auth/hacia-google", { headers: { cookie: jar } }));
    const state = decodeURIComponent(jar.match(/__Host-oauth-state=([^;]+)/)?.[1] ?? "");
    const rCb = await getCallback(ctx(`http://x/api/auth/callback?code=C&state=${state}`, { headers: { cookie: jar, accept: "text/html" } }));
    expect(rCb.status).toBeGreaterThanOrEqual(300);
    expect(control.tenants.get(altaBody.tenant_id)?.ownerGoogleSub).toBe("dueno-nuevo");
    const mem = [...control.memberships.values()].find((m) => m.tenantId === altaBody.tenant_id && m.googleSub === "dueno-nuevo");
    expect(mem).toMatchObject({ rol: "dueno", estado: "activo" });
    const inv = [...control.invitations.values()].find((i) => i.tokenHash === hashToken(token!));
    expect(inv?.estado).toBe("aceptada");
  });
});
