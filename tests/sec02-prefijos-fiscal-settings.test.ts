import { describe, expect, it, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant, tenantPorDefecto } from "../src/lib/tenant-mode.js";
import { esRutaDatos, gateTenantDatos } from "../src/lib/tenant-context.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { resolverCuitFiscal } from "../src/lib/repos/fiscal.js";
import { fiscalSettings } from "../src/db/schema-fiscal.js";
import { POST as postSettings, GET as getSettings } from "../src/pages/api/fiscal/settings.js";
import { ctx } from "./helpers/ctx.js";

const TA = "tenant-a";
const TB = "tenant-b";
const DUENO_A = "sec02-dueno-a";
const DUENO_B = "sec02-dueno-b";
const CUIT_A = "20933331726";
const CUIT_B = "20234567897";
const CUIT_A2 = "27123456780";

const PREFIJOS_NUEVOS = [
  "/api/payment-orders/prepare",
  "/api/payees",
  "/api/counts",
  "/api/stock/conteo",
  "/api/service-accounts",
  "/api/utility-bills",
  "/api/ocr/jobs",
];

function fijarSingle() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env[`TENANT_DATABASE_URL_${TA}`];
  delete process.env[`TENANT_DATABASE_URL_${TB}`];
}

function cuerpoSettings(cuit: string) {
  return {
    cuit,
    razon_social: "Kiosco SEC02",
    domicilio: "Calle 2",
    condicion_iva: "responsable_inscripto",
    inicio_actividades: "2020-01-01",
    pto_vta: "3",
  };
}

describe("SEC2-S1 siete prefijos pasan por el gate de datos", () => {
  beforeEach(() => {
    resetStore();
    fijarSingle();
    process.env.TENANT_MODE = "multi";
  });

  afterEach(() => {
    fijarSingle();
    resetStore();
  });

  it("cada prefijo nuevo es ruta de datos", () => {
    for (const path of PREFIJOS_NUEVOS) expect(esRutaDatos(path)).toBe(true);
  });

  it("multi sin sesión da 403 en cada prefijo nuevo sin tocar datos", () => {
    for (const path of PREFIJOS_NUEVOS) {
      const g = gateTenantDatos(new Request(`http://x${path}`), path);
      expect(g).not.toBeNull();
      if (!g || g.ok) throw new Error(`esperaba 403 para ${path}`);
      expect(g.respuesta.status).toBe(403);
    }
  });

  it("single resuelve como hoy en cada prefijo nuevo", () => {
    fijarSingle();
    for (const path of PREFIJOS_NUEVOS) {
      const g = gateTenantDatos(new Request(`http://x${path}`), path);
      if (!g || !g.ok) throw new Error(`esperaba ok en single para ${path}`);
      expect(g.tenantId).toBe(tenantPorDefecto());
    }
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env[`TENANT_DATABASE_URL_${TA}`] = process.env.PG_TEST_URL_A ?? "";
  process.env[`TENANT_DATABASE_URL_${TB}`] = process.env.PG_TEST_URL_B ?? "";
}

function sembrarDueno(tenantId: string, sub: string) {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: `Kiosco SEC02 ${tenantId}`,
    slug: `kiosco-sec02-${tenantId}`,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.memberships.set(`m-${tenantId}-${sub}`, {
    id: `m-${tenantId}-${sub}`,
    tenantId,
    googleSub: sub,
    rol: "dueno",
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
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

describe.skipIf(!hayPG)("SEC2-S3 fiscal_settings por tenant en PG local", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
    sembrarDueno(TA, DUENO_A);
    sembrarDueno(TB, DUENO_B);
  });

  afterAll(async () => {
    fijarMulti();
    for (const t of [TA, TB]) {
      await conTenant(t, async () => {
        const db = getTenantDb();
        await db.delete(fiscalSettings).where(sql`${fiscalSettings.cuit} IN (${CUIT_A}, ${CUIT_B}, ${CUIT_A2})`);
      });
    }
    fijarSingle();
    resetStore();
  });

  it("la fila de otro tenant no se usa como CUIT propio", async () => {
    fijarMulti();
    await conTenant(TA, async () => {
      const db = getTenantDb();
      await db.delete(fiscalSettings).where(sql`${fiscalSettings.cuit} IN (${CUIT_A}, ${CUIT_B})`);
      await db.insert(fiscalSettings).values({ tenantId: TB, cuit: CUIT_B, puntoVenta: "3" });
      const cuit = await resolverCuitFiscal(undefined);
      expect(cuit).toBeNull();
      await db.insert(fiscalSettings).values({ tenantId: TA, cuit: CUIT_A, puntoVenta: "3" });
      const propio = await resolverCuitFiscal(undefined);
      expect(propio).toBe(Number(CUIT_A));
    });
  });

  it("POST hace upsert por tenant sin duplicar filas", async () => {
    fijarMulti();
    const plano = sesion(DUENO_A, TA);
    const cookie = { cookie: `__Host-sesion=${plano}` };
    const r1 = await postSettings(ctx("http://x/api/fiscal/settings", { body: cuerpoSettings(CUIT_A), headers: cookie }));
    expect(r1.status).toBe(201);
    const r2 = await postSettings(ctx("http://x/api/fiscal/settings", { body: cuerpoSettings(CUIT_A2), headers: cookie }));
    expect(r2.status).toBe(201);
    await conTenant(TA, async () => {
      const db = getTenantDb();
      const filas = await db.select().from(fiscalSettings).where(eq(fiscalSettings.tenantId, TA));
      expect(filas.length).toBe(1);
      expect(filas[0]?.cuit).toBe(CUIT_A2);
      expect(filas[0]?.tenantId).toBe(TA);
    });
  });

  it("GET devuelve lo guardado con memoria vacía", async () => {
    fijarMulti();
    await conTenant(TB, async () => {
      const db = getTenantDb();
      await db.delete(fiscalSettings).where(eq(fiscalSettings.cuit, CUIT_B));
      await db.insert(fiscalSettings).values({ tenantId: TB, cuit: CUIT_B, condicionIva: "monotributo", puntoVenta: "7", modo: "manual" });
    });
    const plano = sesion(DUENO_B, TB);
    const r = await getSettings(ctx("http://x/api/fiscal/settings", { method: "GET", headers: { cookie: `__Host-sesion=${plano}` } }));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { tenant_id: string; cuit: string; condicion_iva: string; pto_vta: string; modo: string };
    expect(j.tenant_id).toBe(TB);
    expect(j.cuit).toBe(CUIT_B);
    expect(j.condicion_iva).toBe("monotributo");
    expect(j.pto_vta).toBe("7");
    expect(j.modo).toBe("manual");
  });
});
