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
  programarCambioPlan,
} from "../src/lib/repos/planes.js";
import { cambioDePlan } from "../src/modules/planes/catalogo.js";
import { posicionProrrateo } from "../src/modules/planes/ciclo.js";
import {
  BillingProviderFalso,
  reiniciarBillingProvider,
  usarBillingProvider,
  type PedidoCobroProrrateo,
} from "../src/modules/planes/proveedor.js";
import { POST as postCambiar } from "../src/pages/api/plan/cambiar.js";

// PLAN-S3 (PRD-PLAN-01): el upgrade inmediato solo corre si el BillingProvider
// confirma el prorrateo. Sin confirmación sigue el 409 requiere_cobro.

const HOY = new Date("2026-10-18T12:00:00Z");
const DESDE_DIA_10 = new Date("2026-10-09T15:00:00Z");
const MONTO_DIA_10 = 1333n;
const MONTO_DIA_11 = 1267n;

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function comercio(id: string, owner: string) {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco",
    slug: id,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: owner,
    esDemo: false,
  });
  control.memberships.set(`m-${id}-dueno`, {
    id: `m-${id}-dueno`,
    tenantId: id,
    googleSub: owner,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  control.memberships.set(`m-${id}-empleado`, {
    id: `m-${id}-empleado`,
    tenantId: id,
    googleSub: `${owner}-emp`,
    rol: "empleado",
    permisos: [],
    estado: "activo",
  });
}

function sesion(sub: string, tenantId: string): string {
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
    ctx("http://x/api/plan/cambiar", {
      method: "POST",
      body: plan as Record<string, unknown>,
      headers: { cookie: `__Host-sesion=${plano}` },
    }),
  );
}

function subActiva(tenantId: string) {
  for (const s of crearAlmacenSuscripciones().comoMapaSoloLectura().values()) {
    if (s.tenantId === tenantId && s.estado === "activa") return s;
  }
  return null;
}

function fijarDesde(tenantId: string, desde: Date) {
  const s = subActiva(tenantId);
  if (!s) throw new Error("sin suscripción activa");
  crearAlmacenSuscripciones().guardar(s.id, { ...s, desde });
}

class ProveedorQueMiraElPlan extends BillingProviderFalso {
  planAlCobrar: string | null = null;

  override async cobrarProrrateo(args: PedidoCobroProrrateo) {
    this.planAlCobrar = subActiva(args.tenantId)?.planId ?? null;
    return super.cobrarProrrateo(args);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: HOY, toFake: ["Date"] });
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
  reiniciarBillingProvider();
});

afterEach(() => {
  vi.useRealTimers();
  singleSinDb();
  reiniciarBillingProvider();
});

describe("PLAN-S3 posición del prorrateo", () => {
  it("el día 10 de un ciclo de 30 anclado en desde deja 20 días", () => {
    expect(posicionProrrateo({ desde: DESDE_DIA_10, ahora: HOY })).toEqual({ diaDelCiclo: 10, diasCiclo: 30 });
    const r = cambioDePlan({ actualId: "basico", destinoId: "plus", diaDelCiclo: 10, diasCiclo: 30 });
    expect(r).toEqual({ efecto: "inmediato", montoProrrateoCentavos: MONTO_DIA_10 });
  });

  it("al día siguiente el prorrateo baja y un ancla futura no adelanta el día", () => {
    expect(posicionProrrateo({ desde: DESDE_DIA_10, ahora: new Date("2026-10-19T12:00:00Z") })).toEqual({
      diaDelCiclo: 11,
      diasCiclo: 30,
    });
    const once = cambioDePlan({ actualId: "basico", destinoId: "plus", diaDelCiclo: 11, diasCiclo: 30 });
    expect(once).toEqual({ efecto: "inmediato", montoProrrateoCentavos: MONTO_DIA_11 });
    expect(posicionProrrateo({ desde: null, ahora: HOY })).toEqual({ diaDelCiclo: 1, diasCiclo: 30 });
    expect(posicionProrrateo({ desde: new Date("2026-10-20T15:00:00Z"), ahora: HOY }).diaDelCiclo).toBe(1);
  });
});

describe("PLAN-S3 POST /api/plan/cambiar con BillingProvider falso", () => {
  it("cobro confirmado: Básico día 10 pasa a Plus al instante con prorrateo 20/30", async () => {
    comercio("t-1", "g-1");
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    fijarDesde("t-1", DESDE_DIA_10);
    const fake = new ProveedorQueMiraElPlan();
    fake.fijarConfirmacion(true);
    usarBillingProvider(fake);
    const plano = sesion("g-1", "t-1");

    const r = await pedirCambiar(plano, { plan: "plus" });

    expect(r.status).toBe(200);
    const sub = subActiva("t-1");
    expect(await r.json()).toEqual({
      efecto: "inmediato",
      plan_actual: "plus",
      plan_programado: null,
      fecha_cambio: null,
      cobro: "confirmado",
      monto_prorrateo_centavos: MONTO_DIA_10.toString(),
      referencia: `fake-${sub?.id}-1`,
    });
    expect(fake.planAlCobrar).toBe("basico");
    expect(fake.llamados).toEqual([
      { tenantId: "t-1", suscripcionId: sub?.id, planDestino: "plus", montoCentavos: MONTO_DIA_10 },
    ]);
    expect(await planIncluye("t-1", "asistente_ia")).toEqual({ incluida: true, cupo: null, planId: "plus" });
    expect(await planIncluye("t-1", "alertas_whatsapp")).toEqual({ incluida: true, cupo: null, planId: "plus" });
    expect(sub?.planProgramado ?? null).toBeNull();
    const evento = control.events.at(-1);
    expect(evento).toMatchObject({
      tipo: "plan_upgrade",
      tenantId: "t-1",
      actor: "g-1",
      detalle: {
        plan_anterior: "basico",
        plan_actual: "plus",
        cobro: "confirmado",
        monto_prorrateo_centavos: MONTO_DIA_10.toString(),
        referencia: `fake-${sub?.id}-1`,
      },
    });
  });

  it("el día 11 el mismo upgrade cobra menos y sigue exigiendo confirmación", async () => {
    comercio("t-1", "g-1");
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    fijarDesde("t-1", DESDE_DIA_10);
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const plano = sesion("g-1", "t-1");

    const pendiente = new BillingProviderFalso();
    usarBillingProvider(pendiente);
    const sinCobro = await pedirCambiar(plano, { plan: "plus" });
    expect(sinCobro.status).toBe(409);
    expect(await sinCobro.json()).toEqual({ error: "requiere_cobro" });
    expect((await leerSuscripcionActiva("t-1"))?.planId).toBe("basico");

    const fake = new BillingProviderFalso();
    fake.fijarConfirmacion(true);
    usarBillingProvider(fake);
    const r = await pedirCambiar(plano, { plan: "plus" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      efecto: "inmediato",
      plan_actual: "plus",
      cobro: "confirmado",
      monto_prorrateo_centavos: MONTO_DIA_11.toString(),
    });
    expect(fake.llamados[0]?.montoCentavos).toBe(MONTO_DIA_11);
    expect(await planIncluye("t-1", "asistente_ia")).toMatchObject({ incluida: true, planId: "plus" });
  });

  it("sin confirmación responde 409 requiere_cobro y no cambia el plan", async () => {
    comercio("t-1", "g-1");
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    fijarDesde("t-1", DESDE_DIA_10);
    const fake = new ProveedorQueMiraElPlan();
    usarBillingProvider(fake);
    const plano = sesion("g-1", "t-1");

    const r = await pedirCambiar(plano, { plan: "plus" });

    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "requiere_cobro" });
    expect(fake.llamados).toHaveLength(1);
    expect(fake.llamados[0]?.montoCentavos).toBe(MONTO_DIA_10);
    expect(fake.planAlCobrar).toBe("basico");
    expect((await leerSuscripcionActiva("t-1"))?.planId).toBe("basico");
    expect(await planIncluye("t-1", "asistente_ia")).toEqual({ incluida: false, cupo: null, planId: "basico" });
    expect(subActiva("t-1")?.planProgramado ?? null).toBeNull();
  });

  it("un body que dice cobro confirmado no alcanza: sigue 409", async () => {
    comercio("t-1", "g-1");
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    fijarDesde("t-1", DESDE_DIA_10);
    const fake = new BillingProviderFalso();
    usarBillingProvider(fake);
    const plano = sesion("g-1", "t-1");

    const r = await pedirCambiar(plano, { plan: "plus", cobro: "confirmado" });

    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "requiere_cobro" });
    expect(fake.llamados).toHaveLength(1);
    expect((await leerSuscripcionActiva("t-1"))?.planId).toBe("basico");
  });

  it("el empleado recibe 403 aunque el proveedor confirmaría, y el plan no cambia", async () => {
    comercio("t-1", "g-1");
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    const fake = new BillingProviderFalso();
    fake.fijarConfirmacion(true);
    usarBillingProvider(fake);
    const plano = sesion("g-1-emp", "t-1");

    const r = await pedirCambiar(plano, { plan: "plus" });

    expect(r.status).toBe(403);
    expect((await leerSuscripcionActiva("t-1"))?.planId).toBe("basico");
    expect(fake.llamados).toHaveLength(0);
  });

  it("sin suscripción responde 409 sin_suscripcion y no cobra", async () => {
    comercio("t-1", "g-1");
    const fake = new BillingProviderFalso();
    fake.fijarConfirmacion(true);
    usarBillingProvider(fake);
    const r = await pedirCambiar(sesion("g-1", "t-1"), { plan: "plus" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "sin_suscripcion" });
    expect(fake.llamados).toHaveLength(0);
  });

  it("el upgrade de un comercio no toca la suscripción del otro", async () => {
    comercio("t-1", "g-1");
    comercio("t-2", "g-2");
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-2", planId: "pro" });
    fijarDesde("t-1", DESDE_DIA_10);
    const fake = new BillingProviderFalso();
    fake.fijarConfirmacion(true);
    usarBillingProvider(fake);

    const r = await pedirCambiar(sesion("g-1", "t-1"), { plan: "plus" });

    expect(r.status).toBe(200);
    expect((await leerSuscripcionActiva("t-1"))?.planId).toBe("plus");
    expect((await leerSuscripcionActiva("t-2"))?.planId).toBe("pro");
    expect(await planIncluye("t-2", "asistente_ia")).toMatchObject({ incluida: true, planId: "pro" });
    expect(fake.llamados.map((l) => l.tenantId)).toEqual(["t-1"]);
  });

  it("un upgrade confirmado cancela la baja programada para que no vuelva a regir", async () => {
    comercio("t-1", "g-1");
    const creada = await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    await programarCambioPlan({
      tenantId: "t-1",
      suscripcionId: creada.id,
      planProgramado: "basico",
      hasta: new Date("2026-11-18T03:00:00Z"),
    });
    const fake = new BillingProviderFalso();
    fake.fijarConfirmacion(true);
    usarBillingProvider(fake);

    const r = await pedirCambiar(sesion("g-1", "t-1"), { plan: "pro" });

    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ efecto: "inmediato", plan_actual: "pro", cobro: "confirmado" });
    const sub = await leerSuscripcionActiva("t-1");
    expect(sub?.planId).toBe("pro");
    expect(sub?.planProgramado ?? null).toBeNull();
  });

  it("en multi sin base responde 503 y no cobra ni sube el plan", async () => {
    comercio("t-1", "g-1");
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    const fake = new BillingProviderFalso();
    fake.fijarConfirmacion(true);
    usarBillingProvider(fake);
    process.env.TENANT_MODE = "multi";

    const r = await pedirCambiar(sesion("g-1", "t-1"), { plan: "plus" });

    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "base_no_disponible" });
    expect(fake.llamados).toHaveLength(0);
    delete process.env.TENANT_MODE;
    expect((await leerSuscripcionActiva("t-1"))?.planId).toBe("basico");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const uuidA = randomUUID();
const uuidB = randomUUID();

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("PLAN-S3 PG: upgrade confirmado aísla tenants", () => {
  it("Dueño de A sube con cobro confirmado y B queda igual", async () => {
    fijarMulti();
    olvidarPlanesEnMemoria();
    const fake = new BillingProviderFalso();
    fake.fijarConfirmacion(true);
    usarBillingProvider(fake);
    try {
      await conTenant("tenant-a", async () => {
        await getTenantDb()
          .insert(tenants)
          .values({ id: uuidA, nombreComercio: `Plan S3 ${sufijoPG}`, slug: `plan-s3-a-${sufijoPG}` })
          .onConflictDoNothing();
        await crearProveedorCobro().crearSuscripcion({ tenantId: uuidA, planId: "basico" });
        await getTenantDb().update(subscriptions).set({ desde: DESDE_DIA_10 }).where(eq(subscriptions.tenantId, uuidA));
      });
      await conTenant("tenant-b", async () => {
        await getTenantDb()
          .insert(tenants)
          .values({ id: uuidB, nombreComercio: `Plan S3 B ${sufijoPG}`, slug: `plan-s3-b-${sufijoPG}` })
          .onConflictDoNothing();
        await crearProveedorCobro().crearSuscripcion({ tenantId: uuidB, planId: "pro" });
      });

      control.tenants.set(uuidA, {
        id: uuidA,
        nombreComercio: "Kiosco A",
        slug: `plan-s3-a-${sufijoPG}`,
        estado: "activo",
        plan: "base",
        moneda: "ARS",
        ownerGoogleSub: "g-a",
        esDemo: false,
      });
      control.memberships.set("m-pg-a", {
        id: "m-pg-a",
        tenantId: uuidA,
        googleSub: "g-a",
        rol: "dueno",
        permisos: [],
        estado: "activo",
      });

      const r = await conTenant("tenant-a", () => pedirCambiar(sesion("g-a", uuidA), { plan: "plus" }));
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({
        efecto: "inmediato",
        plan_actual: "plus",
        cobro: "confirmado",
        monto_prorrateo_centavos: MONTO_DIA_10.toString(),
      });
      const filaA = await conTenant("tenant-a", async () => {
        const filas = await getTenantDb().select().from(subscriptions).where(eq(subscriptions.tenantId, uuidA));
        return filas.filter((f) => f.estado === "activa");
      });
      expect(filaA).toHaveLength(1);
      expect(filaA[0]?.planId).toBe("plus");
      expect(filaA[0]?.planProgramado ?? null).toBeNull();
      const filaB = await conTenant("tenant-b", async () => {
        const filas = await getTenantDb().select().from(subscriptions).where(eq(subscriptions.tenantId, uuidB));
        return filas.filter((f) => f.estado === "activa");
      });
      expect(filaB).toHaveLength(1);
      expect(filaB[0]?.planId).toBe("pro");
      expect(fake.llamados.map((l) => l.tenantId)).toEqual([uuidA]);
    } finally {
      await conTenant("tenant-a", async () => {
        const db = getTenantDb();
        await db.delete(subscriptions).where(eq(subscriptions.tenantId, uuidA));
        await db.delete(tenants).where(eq(tenants.id, uuidA));
      });
      await conTenant("tenant-b", async () => {
        const db = getTenantDb();
        await db.delete(subscriptions).where(eq(subscriptions.tenantId, uuidB));
        await db.delete(tenants).where(eq(tenants.id, uuidB));
      });
    }
  });
});
