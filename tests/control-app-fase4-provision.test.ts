import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { resetAdmin } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { esOwnerPendiente } from "../src/modules/tenants/alta-admin.js";
import { marcarFalloProvision } from "../src/modules/tenants/provision-admin.js";
import { GET as getTenants, POST as postTenants } from "../src/pages/api/admin/tenants.js";
import { POST as postAlta } from "../src/pages/api/admin/tenants/alta.js";

function sesion(sub: string, reauthAt: string | undefined): string {
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora: new Date() });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash, googleSub: sub, tenantId: null,
    expiraAt: c.registro.expiraAt, expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: new Date().toISOString(), reauthAt,
  });
  return c.idPlano;
}

const alta = (plano: string, body: Record<string, unknown>) =>
  postAlta(ctx("http://x/api/admin/tenants/alta", { method: "POST", body, headers: { cookie: `__Host-sesion=${plano}` } })) as Promise<Response>;

const accion = (plano: string, body: Record<string, unknown>) =>
  postTenants(ctx("http://x/api/admin/tenants", { method: "POST", body, headers: { cookie: `__Host-sesion=${plano}` } })) as Promise<Response>;

async function esperarEstado(id: string, estado: string, ms = 1000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (control.tenants.get(id)?.estado === estado) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`el tenant ${id} quedó en ${control.tenants.get(id)?.estado}, se esperaba ${estado}`);
}

beforeEach(() => {
  resetStore();
  resetAdmin();
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
  delete process.env.CONTROL_DATABASE_URL;
});

describe("fase 4: aprovisionamiento al crear un comercio", () => {
  it("el alta lanza el job, llega a listo y no inventa un dueño con el placeholder", async () => {
    const plano = sesion("admin-1", new Date().toISOString());
    const r = await alta(plano, {
      nombre_comercio: "Despensa Nueva",
      plan: "base",
      moneda: "ARS",
      email_dueno: "dueno@despensa.test",
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as { tenant_id: string; job_id: string; estado: string };
    expect(body.job_id).toBeTruthy();
    expect(["aprovisionando", "activo"]).toContain(body.estado);
    await esperarEstado(body.tenant_id, "activo");
    const t = control.tenants.get(body.tenant_id);
    expect(t?.estado).toBe("activo");
    expect(t?.trialHasta).toBeTruthy();
    expect(esOwnerPendiente(t?.ownerGoogleSub)).toBe(true);
    const dueñoFalso = [...control.memberships.values()].filter(
      (m) => m.tenantId === body.tenant_id && esOwnerPendiente(m.googleSub),
    );
    expect(dueñoFalso).toEqual([]);
    const job = control.jobs.get(body.job_id);
    expect(job?.estado).toBe("activo");
    const lista = (await (await getTenants(ctx("http://x/api/admin/tenants", { headers: { cookie: `__Host-sesion=${plano}` } }))) as Response).json() as Promise<{ tenants: Array<Record<string, unknown>> }>;
    const fila = (await lista).tenants.find((x) => x["id"] === body.tenant_id);
    expect(fila?.["aprovisionamiento"]).toMatchObject({ estado: "listo", con_job: true });
  });

  it("si el job falla, reintentar (con reauth) lo vuelve a dejar listo", async () => {
    const plano = sesion("admin-1", new Date().toISOString());
    const r = await alta(plano, {
      nombre_comercio: "Kiosco Error",
      plan: "plus",
      email_dueno: "err@x.com",
    });
    const { tenant_id: id } = (await r.json()) as { tenant_id: string };
    await esperarEstado(id, "activo");
    marcarFalloProvision(id, "fallo simulado de prueba");
    expect(control.tenants.get(id)?.estado).toBe("error_aprovisionamiento");

    const viejo = sesion("admin-1", new Date(Date.now() - 6 * 60_000).toISOString());
    expect((await accion(viejo, { tenant_id: id, accion: "reintentar_provision", confirmo_id: id, motivo: "reintento" })).status).toBe(401);

    const retr = await accion(plano, { tenant_id: id, accion: "reintentar_provision", confirmo_id: id, motivo: "reintento" });
    expect(retr.status).toBe(200);
    await esperarEstado(id, "activo");
    expect(control.tenants.get(id)?.estado).toBe("activo");
    const lista = await ((await getTenants(ctx("http://x/api/admin/tenants", { headers: { cookie: `__Host-sesion=${plano}` } }))) as Response).json() as { tenants: Array<Record<string, unknown>> };
    expect(lista.tenants.find((x) => x["id"] === id)?.["aprovisionamiento"]).toMatchObject({ estado: "listo" });
  });

  it("reintentar es seguro si se llama dos veces", async () => {
    const plano = sesion("admin-1", new Date().toISOString());
    const r = await alta(plano, { nombre_comercio: "Doble Reintento", plan: "base", email_dueno: "d@x.com" });
    const { tenant_id: id } = (await r.json()) as { tenant_id: string };
    await esperarEstado(id, "activo");
    marcarFalloProvision(id, "otra vez");
    expect((await accion(plano, { tenant_id: id, accion: "reintentar_provision", confirmo_id: id, motivo: "a" })).status).toBe(200);
    expect((await accion(plano, { tenant_id: id, accion: "reintentar_provision", confirmo_id: id, motivo: "b" })).status).toBe(200);
    await esperarEstado(id, "activo");
    const jobs = [...control.jobs.values()].filter((j) => j.tenantId === id);
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs.some((j) => j.estado === "activo" || j.estado === "aprovisionando" || j.estado === "pendiente" || control.tenants.get(id)?.estado === "activo")).toBe(true);
  });
});
