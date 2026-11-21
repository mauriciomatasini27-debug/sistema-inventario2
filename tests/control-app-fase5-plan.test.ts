import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { resetAdmin, adminStore } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { invitarEmpleado, parseEmailInvitacion } from "../src/modules/tenants/invitar-empleado.js";
import { crearProveedorCobro, leerSuscripcionActiva, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { GET as getTenants } from "../src/pages/api/admin/tenants.js";
import { POST as postPlan } from "../src/pages/api/admin/tenants/plan.js";
import { GET as getResumen } from "../src/pages/api/plan/resumen.js";

function sesion(sub: string, reauthAt: string | undefined, tenantId: string | null = null): string {
  const c = crearSesion({ googleSub: sub, tenantId, ahora: new Date() });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash, googleSub: sub, tenantId,
    expiraAt: c.registro.expiraAt, expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: new Date().toISOString(), reauthAt,
  });
  return c.idPlano;
}

const cookie = (plano: string) => ({ headers: { cookie: `__Host-sesion=${plano}` } });

const cambiar = (plano: string, body: Record<string, unknown>) =>
  postPlan(ctx("http://x/api/admin/tenants/plan", { method: "POST", body, headers: { cookie: `__Host-sesion=${plano}` } })) as Promise<Response>;

function sembrarTenant(id: string, plan: "demo" | "base" | "plus", miembros: number) {
  control.tenants.set(id, {
    id, nombreComercio: "Comercio " + id, slug: id, estado: "activo",
    plan, moneda: "ARS", ownerGoogleSub: "admin-1", esDemo: plan === "demo",
  });
  for (let i = 0; i < miembros; i += 1) {
    const sub = i === 0 ? "dueno-" + id : `m-${id}-${i}`;
    control.users.set(sub, { googleSub: sub, email: `${sub}@x.test`, emailVerificado: true, nombre: sub });
    control.memberships.set(`mem-${sub}`, {
      id: `mem-${sub}`, tenantId: id, googleSub: sub,
      rol: i === 0 ? "dueno" : "empleado", permisos: [], estado: "activo",
    });
  }
}

beforeEach(() => {
  resetStore();
  resetAdmin();
  olvidarPlanesEnMemoria();
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
  delete process.env.CONTROL_DATABASE_URL;
});

afterEach(() => {
  delete process.env.CONTROL_DATABASE_URL;
});

describe("fase 5: cambio de plan desde el panel", () => {
  it("pide reauth y rechaza un plan inválido", async () => {
    sembrarTenant("t1", "base", 1);
    const viejo = sesion("admin-1", new Date(Date.now() - 6 * 60_000).toISOString());
    expect((await cambiar(viejo, { tenant_id: "t1", plan: "plus" })).status).toBe(401);
    const fresco = sesion("admin-1", new Date().toISOString());
    expect((await cambiar(fresco, { tenant_id: "t1", plan: "pro" })).status).toBe(422);
    expect((await cambiar(fresco, { tenant_id: "no-existe", plan: "plus" })).status).toBe(404);
  });

  it("cambia el plan, queda en el listado y se registra en la auditoría", async () => {
    sembrarTenant("t1", "base", 1);
    const plano = sesion("admin-1", new Date().toISOString());
    const r = await cambiar(plano, { tenant_id: "t1", plan: "plus", motivo: "upgrade de prueba" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { plan: string; de: string; ya?: boolean };
    expect(body).toMatchObject({ plan: "plus", de: "base" });
    expect(control.tenants.get("t1")?.plan).toBe("plus");
    const lista = (await ((await getTenants(ctx("http://x/api/admin/tenants", cookie(plano)))) as Response).json()) as {
      tenants: Array<Record<string, unknown>>;
    };
    const fila = lista.tenants.find((x) => x["id"] === "t1");
    expect(fila?.["plan"]).toBe("plus");
    expect(fila?.["usuarios"]).toMatchObject({ ocupados: 1, limite: 10 });
    const acto = adminStore.actos.find((a) => a.actoKind === "cambio_plan");
    expect(acto?.detalle).toMatchObject({ kind: "cambio_plan", tenantId: "t1", de: "base", a: "plus", motivo: "upgrade de prueba" });
  });

  it("si ya está en ese plan no escribe otro acto", async () => {
    sembrarTenant("t1", "plus", 1);
    const plano = sesion("admin-1", new Date().toISOString());
    const r = await cambiar(plano, { tenant_id: "t1", plan: "plus" });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { ya: boolean }).ya).toBe(true);
    expect(adminStore.actos.filter((a) => a.actoKind === "cambio_plan")).toHaveLength(0);
  });

  it("si la base no guarda el plan responde 503 y revierte la memoria", async () => {
    sembrarTenant("t1", "plus", 1);
    process.env.CONTROL_DATABASE_URL = "postgres://nadie@127.0.0.1:1/no";
    const plano = sesion("admin-1", new Date().toISOString());
    const r = await cambiar(plano, { tenant_id: "t1", plan: "base" });
    expect(r.status).toBe(503);
    expect(control.tenants.get("t1")?.plan).toBe("plus");
  });

  it("al bajar de plan con más usuarios que el cupo nuevo, se permite y el cupo queda lleno", async () => {
    sembrarTenant("t1", "plus", 3);
    const plano = sesion("admin-1", new Date().toISOString());
    const r = await cambiar(plano, { tenant_id: "t1", plan: "base" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { excede_cupo: boolean; usuarios: { ocupados: number; limite_nuevo: number } };
    expect(body.excede_cupo).toBe(true);
    expect(body.usuarios).toMatchObject({ ocupados: 3, limite_nuevo: 2 });
    expect(control.tenants.get("t1")?.plan).toBe("base");
    const email = parseEmailInvitacion("nuevo@x.test");
    expect(email).toBeTruthy();
    const intento = invitarEmpleado(
      { tenantId: "t1", email: email!, creadaPor: "admin-1", intencion: "crear", origen: "http://x", ahora: new Date() },
      { plan: "base", miembrosActivos: 3, miembros: [], pendientes: [] },
    );
    expect(intento.tipo).toBe("cupo_lleno");
  });

  it("el límite del dueño y la suscripción siguen el plan nuevo", async () => {
    sembrarTenant("t1", "plus", 2);
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t1", planId: "plus" });
    const plano = sesion("admin-1", new Date().toISOString());
    expect((await cambiar(plano, { tenant_id: "t1", plan: "base" })).status).toBe(200);
    expect((await leerSuscripcionActiva("t1"))?.planId).toBe("basico");

    const dueno = sesion("dueno-t1", new Date().toISOString(), "t1");
    const resumen = (await getResumen(ctx("http://x/api/plan/resumen", cookie(dueno)))) as Response;
    expect(resumen.status).toBe(200);
    const vista = (await resumen.json()) as { plan_id: string; nombre: string };
    expect(vista.plan_id).toBe("basico");

    const lista = (await ((await getTenants(ctx("http://x/api/admin/tenants", cookie(plano)))) as Response).json()) as {
      tenants: Array<Record<string, unknown>>;
    };
    expect(lista.tenants.find((x) => x["id"] === "t1")?.["usuarios"]).toMatchObject({ ocupados: 2, limite: 2 });
  });
});
