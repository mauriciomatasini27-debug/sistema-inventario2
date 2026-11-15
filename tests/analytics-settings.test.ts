import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { filaPg } from "./helpers/pg-tenant-fixture.js";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as GETSettings, PUT as PUTSettings } from "../src/pages/api/analytics/settings.js";
import { POST as POSTSnapshot } from "../src/pages/api/analytics/snapshots.js";
import { ID_SETTINGS, restablecerRotationSettings } from "../src/lib/repos/rotation-settings.js";
import { getTenantDb } from "../src/lib/db.js";
import { rotationSettings } from "../src/db/schema-analytics.js";
import { DEFAULT_SETTINGS, type RotationSettings } from "../src/modules/analytics/tipos.js";
import { diaUTC, sumarDiasAR, type FechaAR } from "../src/lib/fecha-ar.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const URL_A = process.env.PG_TEST_URL_A;
const TENANT = "t-analytics-settings";

const CUERPO_DEFAULT = {
  ventana_cobertura_dias: 14,
  dormido_n: 30,
  dormido_x: 60,
  cobertura_reponer_dias: 7,
  abc_corte_a_bp: 8000,
  abc_corte_b_bp: 9500,
  abc_min_dias: 30,
  markup_min_bp: 0,
};

function cookie(plano: string): string {
  return `__Host-sesion=${plano}`;
}

function prepararControl(sub = "dueno-analytics", rol: "dueno" | "empleado" = "dueno"): string {
  control.tenants.set(TENANT, {
    id: TENANT,
    nombreComercio: "Kiosco Analytics",
    slug: "kiosco-analytics",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueno-analytics",
    esDemo: false,
  });
  control.memberships.set(`m-${sub}`, {
    id: `m-${sub}`,
    tenantId: TENANT,
    googleSub: sub,
    rol,
    permisos: [],
    estado: "activo",
  });
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: TENANT, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: TENANT,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function leerSettings(plano: string): Promise<Response> {
  return GETSettings(ctx("http://x/api/analytics/settings", { headers: { cookie: cookie(plano) } })) as Promise<Response>;
}

function guardarSettings(plano: string, body: Record<string, unknown>): Promise<Response> {
  return PUTSettings(
    ctx("http://x/api/analytics/settings", { method: "PUT", headers: { cookie: cookie(plano) }, body }),
  ) as Promise<Response>;
}

describe("analytics settings en memoria", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    resetStore();
    restablecerRotationSettings();
  });

  it("GET sin fila devuelve DEFAULT_SETTINGS", async () => {
    const plano = prepararControl();
    const r = await leerSettings(plano);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ settings: DEFAULT_SETTINGS });
  });

  it("PUT guarda la configuración y el GET siguiente la devuelve igual", async () => {
    const plano = prepararControl();
    const p = await guardarSettings(plano, {
      ventana_cobertura_dias: 56,
      dormido_n: 45,
      dormido_x: 90,
      cobertura_reponer_dias: 14,
      abc_corte_a_bp: 7000,
      abc_corte_b_bp: 9000,
      abc_min_dias: 60,
      markup_min_bp: 500,
    });
    expect(p.status).toBe(200);
    const esperado: RotationSettings = {
      ventanaCoberturaDias: 56,
      dormidoN: 45,
      dormidoX: 90,
      coberturaReponerDias: 14,
      abcCorteA_bp: 7000,
      abcCorteB_bp: 9000,
      abcMinDias: 60,
      markupMinBp: 500,
    };
    expect(await p.json()).toEqual({ settings: esperado });
    const g = await leerSettings(plano);
    expect(g.status).toBe(200);
    expect(await g.json()).toEqual({ settings: esperado });
  });

  it("PUT con body inválido responde 422", async () => {
    const plano = prepararControl();
    const r = await guardarSettings(plano, { ...CUERPO_DEFAULT, ventana_cobertura_dias: 30 });
    expect(r.status).toBe(422);
  });

  it("sin sesión responde 403", async () => {
    const r = (await GETSettings(ctx("http://x/api/analytics/settings"))) as Response;
    expect(r.status).toBe(403);
  });

  it("un empleado no puede leer ni cambiar la configuración", async () => {
    const plano = prepararControl("empleado-analytics", "empleado");
    expect((await leerSettings(plano)).status).toBe(403);
    expect((await guardarSettings(plano, CUERPO_DEFAULT)).status).toBe(403);
  });

  it("el snapshot usa la configuración vigente en el resumen", async () => {
    const plano = prepararControl();
    const hoy = diaUTC(new Date());
    for (const n of [1, 2, 3]) {
      store.stockMoves.push({ idemKey: `venta-${n}`, sku: "demo-sku-1", loteId: null, delta: -1, tipo: "VENTA" });
    }

    const primera = (await POSTSnapshot(
      ctx("http://x/api/analytics/snapshots", {
        body: { desde: sumarDiasAR(hoy as FechaAR, -6), hasta: hoy, origen: "manual" },
      }),
    )) as Response;
    expect(primera.status).toBe(201);
    const r1 = (await primera.json()) as { resumen: { reponer: unknown[] } };
    expect(r1.resumen.reponer).toEqual([]);

    const p = await guardarSettings(plano, { ...CUERPO_DEFAULT, cobertura_reponer_dias: 30 });
    expect(p.status).toBe(200);

    const segunda = (await POSTSnapshot(
      ctx("http://x/api/analytics/snapshots", {
        body: { desde: sumarDiasAR(hoy as FechaAR, -7), hasta: hoy, origen: "manual" },
      }),
    )) as Response;
    expect(segunda.status).toBe(201);
    const r2 = (await segunda.json()) as { resumen: { reponer: Array<{ nombre: string; cobertura: number | null }> } };
    expect(r2.resumen.reponer.map((item) => item.nombre)).toEqual(["demo-sku-1"]);
  });
});

describe.skipIf(!URL_A)("analytics settings Postgres", () => {
  let db: ReturnType<typeof getTenantDb>;

  beforeAll(async () => {
    const base = await asegurarBasePrivada("analytics_settings_single", URL_A ?? "");
    process.env.TENANT_DATABASE_URL = base;
    delete process.env.TENANT_MODE;
    db = getTenantDb();
  });

  afterAll(() => {
    delete process.env.TENANT_DATABASE_URL;
  });

  beforeEach(async () => {
    resetStore();
    restablecerRotationSettings();
    await db.delete(rotationSettings);
  });

  it("PUT persiste la fila única y GET la lee de la base", async () => {
    const plano = prepararControl();
    const cuerpo = {
      ventana_cobertura_dias: 56,
      dormido_n: 40,
      dormido_x: 80,
      cobertura_reponer_dias: 10,
      abc_corte_a_bp: 7500,
      abc_corte_b_bp: 9200,
      abc_min_dias: 45,
      markup_min_bp: 250,
    };
    const p = await guardarSettings(plano, cuerpo);
    expect(p.status).toBe(200);

    const filas = await db.select().from(rotationSettings);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      id: ID_SETTINGS,
      ventanaCoberturaDias: 56,
      dormidoN: 40,
      dormidoX: 80,
      coberturaReponerDias: 10,
      abcCorteA: 7500,
      abcCorteB: 9200,
      abcMinDias: 45,
      markupMinBp: 250,
    });

    const g = await leerSettings(plano);
    expect(g.status).toBe(200);
    expect(await g.json()).toEqual({
      settings: {
        ventanaCoberturaDias: 56,
        dormidoN: 40,
        dormidoX: 80,
        coberturaReponerDias: 10,
        abcCorteA_bp: 7500,
        abcCorteB_bp: 9200,
        abcMinDias: 45,
        markupMinBp: 250,
      },
    });
  });

  it("GET devuelve los valores de la fila y no los defaults", async () => {
    const plano = prepararControl();
    await db.insert(rotationSettings).values(filaPg({
      id: ID_SETTINGS,
      ventanaCoberturaDias: 14,
      dormidoN: 12,
      dormidoX: 24,
      coberturaReponerDias: 4,
      abcCorteA: 6000,
      abcCorteB: 8500,
      abcMinDias: 20,
      markupMinBp: 100,
      updatedAt: new Date(),
    }));
    const g = await leerSettings(plano);
    expect(g.status).toBe(200);
    expect(await g.json()).toEqual({
      settings: {
        ventanaCoberturaDias: 14,
        dormidoN: 12,
        dormidoX: 24,
        coberturaReponerDias: 4,
        abcCorteA_bp: 6000,
        abcCorteB_bp: 8500,
        abcMinDias: 20,
        markupMinBp: 100,
      },
    });
  });
});

describe.skipIf(!URL_A)("analytics settings multi sin base", () => {
  beforeAll(() => {
    process.env.TENANT_MODE = "multi";
    delete process.env.TENANT_DATABASE_URL;
    delete process.env[`TENANT_DATABASE_URL_${TENANT}`];
  });

  afterAll(() => {
    delete process.env.TENANT_MODE;
    delete process.env[`TENANT_DATABASE_URL_${TENANT}`];
  });

  beforeEach(() => {
    resetStore();
    restablecerRotationSettings();
  });

  it("GET y PUT responden 503 cuando falta la base del comercio", async () => {
    const plano = prepararControl();
    const g = await leerSettings(plano);
    expect(g.status).toBe(503);
    expect(await g.json()).toEqual({ error: "base_no_disponible" });
    const p = await guardarSettings(plano, CUERPO_DEFAULT);
    expect(p.status).toBe(503);
    expect(await p.json()).toEqual({ error: "base_no_disponible" });
  });

  it("el snapshot responde 503 cuando no puede leer la configuración", async () => {
    const r = (await POSTSnapshot(
      ctx("http://x/api/analytics/snapshots", {
        body: { desde: "2026-10-01", hasta: "2026-10-07", origen: "manual" },
      }),
    )) as Response;
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "base_no_disponible" });
  });
});
