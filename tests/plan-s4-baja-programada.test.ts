import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { tenants } from "../src/db/schema.js";
import { subscriptions } from "../src/db/schema-planes.js";
import { crearAlmacenSuscripciones } from "../src/lib/repos/_almacen.js";
import {
  crearProveedorCobro,
  leerSuscripcionActiva,
  olvidarPlanesEnMemoria,
  planIncluye,
} from "../src/lib/repos/planes.js";
import { fechaCambioDePlan, finDeCicloMensual, inicioDiaAR, planVigenteDe } from "../src/modules/planes/ciclo.js";
import { fechaAR } from "../src/lib/fecha-ar.js";
import { GET as getPlan } from "../src/pages/api/plan/resumen.js";
import { POST as postCambiar } from "../src/pages/api/plan/cambiar.js";

// PLAN-S4 (PRD-PLAN-01, ADR-0047): baja programada a fin de período.

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
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
  control.memberships.set("m-2", {
    id: "m-2",
    tenantId: "t-1",
    googleSub: "g-3",
    rol: "empleado",
    permisos: [],
    estado: "activo",
  });
}

function sesion(sub: string, tenantId: string | null): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function pedirCambiar(plano: string, plan: unknown) {
  return postCambiar(
    ctx("http://x/api/plan/cambiar", { method: "POST", body: plan as Record<string, unknown>, headers: { cookie: `__Host-sesion=${plano}` } }),
  );
}

function pedirResumen(plano: string) {
  return getPlan(ctx("http://x/api/plan/resumen", { headers: { cookie: `__Host-sesion=${plano}` } }));
}

function subActivaMemoria(tenantId: string) {
  for (const s of crearAlmacenSuscripciones().comoMapaSoloLectura().values()) {
    if (s.tenantId === tenantId && s.estado === "activa") return s;
  }
  return null;
}

function fijarHastaMemoria(tenantId: string, hasta: Date) {
  const s = subActivaMemoria(tenantId);
  if (!s) throw new Error("sin suscripción activa en memoria");
  crearAlmacenSuscripciones().guardar(s.id, { ...s, hasta });
}

// Reloj fijo: las fechas esperadas son literales y no vencen con el tiempo.
const HOY = new Date("2026-10-18T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ now: HOY, toFake: ["Date"] });
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
});

afterEach(() => {
  vi.useRealTimers();
  singleSinDb();
});

describe("PLAN-S4 fecha del cambio (pura)", () => {
  const ahora = new Date("2026-10-18T12:00:00Z");

  it("si la suscripción tiene hasta, la fecha del cambio es hasta", () => {
    expect(
      fechaCambioDePlan({ desde: new Date("2026-10-05T12:00:00Z"), hasta: new Date("2026-11-20T12:00:00Z"), ahora }),
    ).toBe("2026-11-20");
  });

  it("hasta vencido no cuenta: vuelve al ciclo anclado en desde", () => {
    expect(
      fechaCambioDePlan({ desde: new Date("2026-10-05T12:00:00Z"), hasta: new Date("2026-10-01T12:00:00Z"), ahora }),
    ).toBe("2026-11-05");
  });

  it("sin hasta ancla el fin del ciclo en el día de desde, siempre después de hoy", () => {
    const desde = new Date("2026-10-05T12:00:00Z");
    expect(finDeCicloMensual(desde, new Date("2026-10-04T12:00:00Z"))).toBe("2026-10-05");
    expect(finDeCicloMensual(desde, new Date("2026-10-05T12:00:00Z"))).toBe("2026-11-05");
    expect(finDeCicloMensual(desde, new Date("2026-10-18T12:00:00Z"))).toBe("2026-11-05");
    expect(finDeCicloMensual(desde, new Date("2026-11-05T12:00:00Z"))).toBe("2026-12-05");
  });

  it("el aniversario cruza el año desde diciembre", () => {
    expect(finDeCicloMensual(new Date("2026-12-15T12:00:00Z"), new Date("2026-12-20T12:00:00Z"))).toBe("2027-01-15");
  });

  it("día 31 en meses cortos cae al último día del mes", () => {
    const desde31 = new Date("2026-01-31T12:00:00Z");
    expect(finDeCicloMensual(desde31, new Date("2026-02-10T12:00:00Z"))).toBe("2026-02-28");
    expect(finDeCicloMensual(desde31, new Date("2026-02-28T12:00:00Z"))).toBe("2026-03-31");
    expect(finDeCicloMensual(new Date("2024-01-31T12:00:00Z"), new Date("2024-02-10T12:00:00Z"))).toBe("2024-02-29");
  });

  it("sin hasta ni desde el ciclo arranca hoy", () => {
    expect(fechaCambioDePlan({ desde: null, hasta: null, ahora })).toBe("2026-11-18");
  });

  it("inicioDiaAR es la medianoche de Buenos Aires de esa fecha", () => {
    expect(inicioDiaAR(fechaAR(new Date("2026-11-05T12:00:00Z"))).toISOString()).toBe("2026-11-05T03:00:00.000Z");
  });

  it("planVigenteDe rueda al llegar hasta y sigue rodado aunque se lea días después", () => {
    const base = { planId: "plus" as const, planProgramado: "basico" as const, hasta: inicioDiaAR(fechaAR(new Date("2026-11-05T12:00:00Z"))) };
    expect(planVigenteDe({ ...base, ahora: new Date("2026-11-04T12:00:00Z") })).toEqual({ planId: "plus", planProgramado: "basico" });
    expect(planVigenteDe({ ...base, ahora: new Date("2026-11-05T12:00:00Z") })).toEqual({ planId: "basico", planProgramado: null });
    expect(planVigenteDe({ ...base, ahora: new Date("2026-11-20T12:00:00Z") })).toEqual({ planId: "basico", planProgramado: null });
    expect(planVigenteDe({ planId: "plus", planProgramado: null, hasta: base.hasta, ahora })).toEqual({
      planId: "plus",
      planProgramado: null,
    });
  });
});

describe("PLAN-S4 POST /api/plan/cambiar (memoria)", () => {
  it("sin sesión no deja pasar", async () => {
    comercio();
    const r = await postCambiar(ctx("http://x/api/plan/cambiar", { method: "POST", body: { plan: "basico" } }));
    expect(r.status).toBe(403);
  });

  it("el empleado recibe 403", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    const plano = sesion("g-3", "t-1");
    expect((await pedirCambiar(plano, { plan: "basico" })).status).toBe(403);
  });

  it("plan inexistente responde 422", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    const plano = sesion("g-1", "t-1");
    expect((await pedirCambiar(plano, { plan: "enterprise" })).status).toBe(422);
  });

  it("sin suscripción activa responde 409 sin_suscripcion", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");
    const r = await pedirCambiar(plano, { plan: "basico" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "sin_suscripcion" });
  });

  it("subir de plan responde 409 requiere_cobro sin tocar la suscripción", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    const plano = sesion("g-1", "t-1");
    const r = await pedirCambiar(plano, { plan: "pro" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "requiere_cobro" });
    const sub = await leerSuscripcionActiva("t-1");
    expect(sub?.planId).toBe("plus");
    expect(sub?.planProgramado ?? null).toBeNull();
  });

  it("Dueño en Plus pide Básico: 200 fin_de_ciclo con la fecha y el plan vigente no cambia", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    fijarHastaMemoria("t-1", new Date("2026-11-20T12:00:00Z"));
    const plano = sesion("g-1", "t-1");
    const r = await pedirCambiar(plano, { plan: "basico" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      efecto: "fin_de_ciclo",
      plan_actual: "plus",
      plan_programado: "basico",
      fecha_cambio: "2026-11-20",
    });
    expect(await planIncluye("t-1", "asistente_ia")).toEqual({ incluida: true, cupo: null, planId: "plus" });
    const guardada = subActivaMemoria("t-1");
    expect(guardada?.planId).toBe("plus");
    expect(guardada?.planProgramado).toBe("basico");
  });

  it("con la fecha del cambio el plan vigente pasa a ser el programado", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    fijarHastaMemoria("t-1", new Date("2026-11-20T12:00:00Z"));
    const plano = sesion("g-1", "t-1");
    await pedirCambiar(plano, { plan: "basico" });
    expect(await planIncluye("t-1", "asistente_ia")).toMatchObject({ incluida: true, planId: "plus" });

    fijarHastaMemoria("t-1", new Date("2026-10-01T12:00:00Z"));
    expect(await planIncluye("t-1", "asistente_ia")).toEqual({ incluida: false, cupo: null, planId: "basico" });
    expect(await planIncluye("t-1", "bot_consulta")).toEqual({ incluida: true, cupo: 100, planId: "basico" });
    const guardada = subActivaMemoria("t-1");
    expect(guardada?.planId).toBe("basico");
    expect(guardada?.planProgramado ?? null).toBeNull();
  });

  it("mismo plan cancela el cambio programado y responde sin_cambio", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    fijarHastaMemoria("t-1", new Date("2026-11-20T12:00:00Z"));
    const plano = sesion("g-1", "t-1");
    await pedirCambiar(plano, { plan: "basico" });
    const r = await pedirCambiar(plano, { plan: "plus" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ efecto: "sin_cambio", plan_actual: "plus", plan_programado: null, fecha_cambio: null });
    expect(subActivaMemoria("t-1")?.planProgramado ?? null).toBeNull();
    expect(await planIncluye("t-1", "asistente_ia")).toMatchObject({ incluida: true, planId: "plus" });
  });

  it("sin hasta la baja se ancla en el aniversario de desde y rueda aunque nadie lea ese día", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    const plano = sesion("g-1", "t-1");
    const r = await pedirCambiar(plano, { plan: "basico" });
    expect(await r.json()).toEqual({
      efecto: "fin_de_ciclo",
      plan_actual: "plus",
      plan_programado: "basico",
      fecha_cambio: "2026-11-18",
    });
    vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
    expect(await planIncluye("t-1", "asistente_ia")).toMatchObject({ incluida: true, planId: "plus" });
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
    expect(await planIncluye("t-1", "asistente_ia")).toEqual({ incluida: false, cupo: null, planId: "basico" });
    const guardada = subActivaMemoria("t-1");
    expect(guardada?.planProgramado ?? null).toBeNull();
    expect(guardada?.hasta ?? null).toBeNull();
    expect(guardada?.desde?.toISOString()).toBe("2026-11-18T03:00:00.000Z");
  });

  it("registra el cambio en control.events", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    fijarHastaMemoria("t-1", new Date("2026-11-20T12:00:00Z"));
    const plano = sesion("g-1", "t-1");
    await pedirCambiar(plano, { plan: "basico" });
    const evento = control.events.at(-1);
    expect(evento?.tipo).toBe("plan_baja_programada");
    expect(evento?.tenantId).toBe("t-1");
    expect(evento?.actor).toBe("g-1");
    expect(evento?.detalle).toEqual({ plan_actual: "plus", plan_programado: "basico", fecha_cambio: "2026-11-20" });
  });

  it("el resumen muestra plan_programado y fecha_cambio", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    fijarHastaMemoria("t-1", new Date("2026-11-20T12:00:00Z"));
    const plano = sesion("g-1", "t-1");
    await pedirCambiar(plano, { plan: "basico" });
    const body = (await (await pedirResumen(plano)).json()) as Record<string, unknown>;
    expect(body["plan_id"]).toBe("plus");
    expect(body["plan_programado"]).toBe("basico");
    expect(body["plan_programado_nombre"]).toBe("Básico");
    expect(body["fecha_cambio"]).toBe("2026-11-20");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const uuidPG = randomUUID();

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function borrarRastroPG() {
  await conTenant("tenant-a", async () => {
    const db = getTenantDb();
    await db.delete(subscriptions).where(eq(subscriptions.tenantId, uuidPG));
    await db.delete(tenants).where(eq(tenants.id, uuidPG));
  });
}

describe.skipIf(!hayPG)("PLAN-S4 PG: baja programada sobre Postgres", () => {
  it("Dueño pide bajar de Plus a Básico: fin_de_ciclo con fecha y el plan rueda al llegar", async () => {
    fijarMulti();
    olvidarPlanesEnMemoria();
    await conTenant("tenant-a", async () => {
      await getTenantDb()
        .insert(tenants)
        .values({ id: uuidPG, nombreComercio: `Plan S4 ${sufijoPG}`, slug: `plan-s4-${sufijoPG}` })
        .onConflictDoNothing();
      await crearProveedorCobro().crearSuscripcion({ tenantId: uuidPG, planId: "plus" });
      const db = getTenantDb();
      await db.update(subscriptions).set({ hasta: new Date("2026-11-20T12:00:00Z") }).where(eq(subscriptions.tenantId, uuidPG));

      control.tenants.set(uuidPG, {
        id: uuidPG,
        nombreComercio: "Kiosco PG",
        slug: `plan-s4-${sufijoPG}`,
        estado: "activo",
        plan: "base",
        moneda: "ARS",
        ownerGoogleSub: "g-1",
        esDemo: false,
      });
      control.memberships.set("m-pg", {
        id: "m-pg",
        tenantId: uuidPG,
        googleSub: "g-1",
        rol: "dueno",
        permisos: [],
        estado: "activo",
      });
      const plano = sesion("g-1", uuidPG);

      const r = await postCambiar(
        ctx("http://x/api/plan/cambiar", { method: "POST", body: { plan: "basico" }, headers: { cookie: `__Host-sesion=${plano}` } }),
      );
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({
        efecto: "fin_de_ciclo",
        plan_actual: "plus",
        plan_programado: "basico",
        fecha_cambio: "2026-11-20",
      });
      expect(await planIncluye(uuidPG, "asistente_ia")).toMatchObject({ incluida: true, planId: "plus" });

      await db.update(subscriptions).set({ hasta: new Date("2026-10-01T12:00:00Z") }).where(eq(subscriptions.tenantId, uuidPG));
      expect(await planIncluye(uuidPG, "asistente_ia")).toEqual({ incluida: false, cupo: null, planId: "basico" });
      const filas = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, uuidPG));
      expect(filas.length).toBe(1);
      expect(filas[0]?.planId).toBe("basico");
      expect(filas[0]?.planProgramado ?? null).toBeNull();
    });
    await borrarRastroPG();
  });
});
