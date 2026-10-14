import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { resetAdmin } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as GETTenants, POST as POSTTenants } from "../src/pages/api/admin/tenants.js";
import { GET as GETActos } from "../src/pages/api/admin/actos.js";
import { POST as POSTRollout } from "../src/pages/api/admin/rollouts.js";

function adminSesion(sub: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, { idHash: c.registro.idHash, googleSub: sub, tenantId: null, expiraAt: c.registro.expiraAt, expiraAbsoluta: c.registro.expiraAbsoluta, lastSeenAt: ahora.toISOString(), reauthAt: ahora.toISOString() });
  return c.idPlano;
}

function req(url: string, plano: string, body?: unknown) {
  return ctx(url, {
    method: body ? "POST" : "GET",
    ...(body !== undefined ? { body: body as Record<string, unknown> } : {}),
    headers: { cookie: `__Host-sesion=${plano}` },
  });
}

beforeEach(() => { resetStore(); resetAdmin(); process.env.ADMIN_ALLOWLIST_SUBS = "admin-1"; });

describe("N5 admin OP-S1/S2", () => {
  it("tenants lista + suspender/reactivar + 409 repetido", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", { id: "t1", nombreComercio: "K", slug: "k", estado: "activo", plan: "base", moneda: "ARS", ownerGoogleSub: "d1", esDemo: false });
    const g = (await GETTenants(req("http://x/api/admin/tenants", plano))) as Response;
    expect(g.status).toBe(200);
    const s = (await POSTTenants(req("http://x/api/admin/tenants", plano, { tenant_id: "t1", accion: "suspender", confirmo_id: "t1", motivo: "mora" }))) as Response;
    expect(s.status).toBe(200);
    const s2 = (await POSTTenants(req("http://x/api/admin/tenants", plano, { tenant_id: "t1", accion: "suspender", confirmo_id: "t1", motivo: "x" }))) as Response;
    expect(s2.status).toBe(409);
    const r = (await POSTTenants(req("http://x/api/admin/tenants", plano, { tenant_id: "t1", accion: "reactivar", confirmo_id: "t1", motivo: "pago" }))) as Response;
    expect(r.status).toBe(200);
  });
  it("audit filtra desde/hasta + rollout 202", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", { id: "t1", nombreComercio: "K", slug: "k", estado: "activo", plan: "base", moneda: "ARS", ownerGoogleSub: "d1", esDemo: false });
    await POSTTenants(req("http://x/api/admin/tenants", plano, { tenant_id: "t1", accion: "suspender", confirmo_id: "t1", motivo: "m" }));
    const a = (await GETActos(req("http://x/api/admin/actos?tenant_id=t1&desde=2000-01-01&hasta=2100-01-01", plano))) as Response;
    expect(a.status).toBe(200);
    const ro = (await POSTRollout(req("http://x/api/admin/rollouts/reintentar", plano, { rollout_id: "r1" }))) as Response;
    expect(ro.status).toBe(202);
  });
});
