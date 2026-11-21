import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { resetAdmin } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { esAdminAllowlist, leerAllowlist } from "../src/modules/admin/guard.js";
import { esSuperadmin } from "../src/lib/control.js";
import { POST as postTenants } from "../src/pages/api/tenants.js";
import { GET as getEmbudo } from "../src/pages/api/admin/onboarding/embudo.js";

function sesionEnStore(sub: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: null,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function fijarListas(admin?: string, superadmin?: string): void {
  if (admin === undefined) delete process.env.ADMIN_ALLOWLIST_SUBS;
  else process.env.ADMIN_ALLOWLIST_SUBS = admin;
  if (superadmin === undefined) delete process.env.SUPERADMIN_SUBS;
  else process.env.SUPERADMIN_SUBS = superadmin;
}

function cuerpoTenants(sufijo: string) {
  return {
    nombre_comercio: `Kiosco P912 ${sufijo}`,
    plan: "base",
    owner_google_sub: `dueno-p912-${sufijo}`,
    moneda: "ARS",
    request_key: `p912-${sufijo}-${Date.now()}`,
  };
}

beforeEach(() => {
  resetStore();
  resetAdmin();
  fijarListas();
});

afterEach(() => {
  fijarListas();
  vi.restoreAllMocks();
});

describe("P9-12 lista única de admins", () => {
  it("solo ADMIN gobierna superadmin y admin", () => {
    fijarListas("admin-a");
    expect(leerAllowlist()).toEqual(["admin-a"]);
    expect(esSuperadmin("admin-a")).toBe(true);
    expect(esSuperadmin("otro")).toBe(false);
    expect(esAdminAllowlist("admin-a", leerAllowlist())).toBe(true);
  });

  it("SUPERADMIN_SUBS ya no da acceso", () => {
    fijarListas("", "leg-1");
    expect(leerAllowlist()).toEqual([]);
    expect(esSuperadmin("leg-1")).toBe(false);
  });

  it("dos subs cierran el panel para los dos y lo loguean una vez sin subs", async () => {
    vi.resetModules();
    const fresco = await import("../src/modules/admin/guard.js");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fijarListas("sub-a, sub-b");
    expect(fresco.leerAllowlist()).toEqual([]);
    expect(fresco.esAdminAllowlist("sub-a", fresco.leerAllowlist())).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    const mensaje = String(error.mock.calls[0]?.[0] ?? "");
    expect(mensaje).toContain("exactamente 1");
    expect(mensaje).not.toContain("sub-a");
  });

  it("recorta y dedupa: el mismo sub repetido cuenta como uno", () => {
    fijarListas(" a1 , a1,, ");
    expect(leerAllowlist()).toEqual(["a1"]);
  });

  it("dos subs: la ruta admin responde 403 aun para un sub de la lista", async () => {
    fijarListas("sub-a,sub-b");
    const plano = sesionEnStore("sub-a");
    const e = (await getEmbudo(
      ctx("http://x/api/admin/onboarding/embudo", { headers: { cookie: `__Host-sesion=${plano}` } }),
    )) as Response;
    expect(e.status).toBe(403);
  });

  it("vacía: nadie es admin, 403 en tenants y en rutas exigirAdmin", async () => {
    fijarListas("", "");
    expect(esSuperadmin("cualquiera")).toBe(false);
    expect(esAdminAllowlist("cualquiera", leerAllowlist())).toBe(false);
    const plano = sesionEnStore("cualquiera");
    const t = (await postTenants(
      ctx("http://x/api/tenants", {
        method: "POST",
        body: cuerpoTenants("vacia"),
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    )) as Response;
    expect(t.status).toBe(403);
    const e = (await getEmbudo(
      ctx("http://x/api/admin/onboarding/embudo", { headers: { cookie: `__Host-sesion=${plano}` } }),
    )) as Response;
    expect(e.status).toBe(403);
  });

  it("POST /api/tenants permite un sub solo en ADMIN_ALLOWLIST_SUBS", async () => {
    fijarListas("solo-admin", "");
    const planoAdmin = sesionEnStore("solo-admin");
    const ok = (await postTenants(
      ctx("http://x/api/tenants", {
        method: "POST",
        body: cuerpoTenants("solo"),
        headers: { cookie: `__Host-sesion=${planoAdmin}` },
      }),
    )) as Response;
    expect(ok.status).toBe(201);
    const planoFuera = sesionEnStore("nadie");
    const no = (await postTenants(
      ctx("http://x/api/tenants", {
        method: "POST",
        body: cuerpoTenants("fuera"),
        headers: { cookie: `__Host-sesion=${planoFuera}` },
      }),
    )) as Response;
    expect(no.status).toBe(403);
  });

  it("embudo y tenants consistentes con la misma lista", async () => {
    fijarListas("comun-admin", "");
    const planoAdmin = sesionEnStore("comun-admin");
    const planoFuera = sesionEnStore("visitante");
    const t = (await postTenants(
      ctx("http://x/api/tenants", {
        method: "POST",
        body: cuerpoTenants("comun"),
        headers: { cookie: `__Host-sesion=${planoAdmin}` },
      }),
    )) as Response;
    expect(t.status).toBe(201);
    const eOk = (await getEmbudo(
      ctx("http://x/api/admin/onboarding/embudo", { headers: { cookie: `__Host-sesion=${planoAdmin}` } }),
    )) as Response;
    expect(eOk.status).toBe(200);
    const eNo = (await getEmbudo(
      ctx("http://x/api/admin/onboarding/embudo", { headers: { cookie: `__Host-sesion=${planoFuera}` } }),
    )) as Response;
    expect(eNo.status).toBe(403);
  });
});
