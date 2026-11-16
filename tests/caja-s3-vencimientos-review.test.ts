import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { control } from "../src/lib/store.js";
import { POST as postJobCaja } from "../src/pages/api/jobs/vencimientos-caja.js";
import { POST as postJobLotes } from "../src/pages/api/jobs/vencimientos-lotes.js";
import { activarTenantPgEnSingle } from "./helpers/pg-tenant-fixture.js";

const SECRETO = "review-s3-secreto";

function modoSingle() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function modoMulti() {
  process.env.TENANT_MODE = "multi";
}

function fijarTenant(id: string) {
  control.tenants.set(id, {
    id,
    nombreComercio: id,
    slug: id,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueño-1",
    esDemo: false,
  });
}

describe("CAJA-S3 review M1: auth de jobs vencimientos", () => {
  beforeEach(() => {
    modoSingle();
    resetStore();
    delete process.env.JOBS_SECRET;
  });
  afterEach(() => {
    modoSingle();
    resetStore();
    delete process.env.JOBS_SECRET;
  });

  it("caja: secreto wrong → 401 no autorizado", async () => {
    process.env.JOBS_SECRET = SECRETO;
    const r = (await postJobCaja(
      ctx("http://x/api/jobs/vencimientos-caja", { method: "POST", headers: { "X-Job-Secret": "otro" } }),
    )) as Response;
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "no autorizado" });
  });

  it("lotes: secreto wrong → 401 no autorizado", async () => {
    process.env.JOBS_SECRET = SECRETO;
    const r = (await postJobLotes(
      ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST", headers: { "X-Job-Secret": "otro" } }),
    )) as Response;
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "no autorizado" });
  });

  it("caja+lotes: header con JOBS_SECRET sin setear → 401", async () => {
    delete process.env.JOBS_SECRET;
    const rc = (await postJobCaja(
      ctx("http://x/api/jobs/vencimientos-caja", { method: "POST", headers: { "X-Job-Secret": "cualquiera" } }),
    )) as Response;
    expect(rc.status).toBe(401);
    const rl = (await postJobLotes(
      ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST", headers: { "X-Job-Secret": "cualquiera" } }),
    )) as Response;
    expect(rl.status).toBe(401);
  });

  it("caja+lotes: sin header en multi → 401", async () => {
    modoMulti();
    process.env.JOBS_SECRET = SECRETO;
    fijarTenant("tenant-a");
    const rc = (await postJobCaja(ctx("http://x/api/jobs/vencimientos-caja", { method: "POST" }))) as Response;
    expect(rc.status).toBe(401);
    expect(await rc.json()).toEqual({ error: "no autorizado" });
    const rl = (await postJobLotes(ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST" }))) as Response;
    expect(rl.status).toBe(401);
    expect(await rl.json()).toEqual({ error: "no autorizado" });
  });

  it("caja+lotes: sin header en single → 200", async () => {
    modoSingle();
    delete process.env.JOBS_SECRET;
    const rc = (await postJobCaja(ctx("http://x/api/jobs/vencimientos-caja", { method: "POST" }))) as Response;
    expect(rc.status).toBe(200);
    const rl = (await postJobLotes(ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST" }))) as Response;
    expect(rl.status).toBe(200);
  });

  it("caja+lotes: secreto válido → 200", async () => {
    modoSingle();
    process.env.JOBS_SECRET = SECRETO;
    const rc = (await postJobCaja(
      ctx("http://x/api/jobs/vencimientos-caja", { method: "POST", headers: { "X-Job-Secret": SECRETO } }),
    )) as Response;
    expect(rc.status).toBe(200);
    const rl = (await postJobLotes(
      ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST", headers: { "X-Job-Secret": SECRETO } }),
    )) as Response;
    expect(rl.status).toBe(200);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const DIA_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

function modoSinglePG(url: string) {
  modoSingle();
  process.env.TENANT_DATABASE_URL = url;
  activarTenantPgEnSingle();
}

describe.skipIf(!hayPG)("CAJA-S3 review H3 PG", () => {
  beforeEach(() => {
    modoSingle();
    resetStore();
    delete process.env.TENANT_DATABASE_URL;
  });
  afterEach(() => {
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.DEFAULT_TENANT_ID;
    modoSingle();
    resetStore();
  });

  it("H3: doble llamado concurrente marca cada id una sola vez y excluye avisado/pagada", async () => {
    const { eq } = await import("drizzle-orm");
    const { getTenantDb } = await import("../src/lib/db.js");
    const { cashDueItems } = await import("../src/db/schema.js");
    const { crearVencimiento, marcarAvisados, pagarVencimiento } = await import("../src/lib/repos/caja.js");
    modoSinglePG(process.env.PG_TEST_URL_A ?? "");
    resetStore();
    try {
      const db = getTenantDb();
      const a = await crearVencimiento({ concepto: "H3-a", venceEl: iso(Date.now() + 2 * DIA_MS), montoCentavos: 1000 });
      const b = await crearVencimiento({ concepto: "H3-b", venceEl: iso(Date.now() + 2 * DIA_MS), montoCentavos: 2000 });
      const [r1, r2] = await Promise.all([
        marcarAvisados([a.id, b.id], iso(Date.now())),
        marcarAvisados([a.id, b.id], iso(Date.now())),
      ]);
      const union = [...r1, ...r2].sort();
      expect(union).toEqual([a.id, b.id].sort());
      expect(new Set(union).size).toBe(union.length);

      expect(await marcarAvisados([a.id, b.id], iso(Date.now()))).toEqual([]);

      const c = await crearVencimiento({ concepto: "H3-c", venceEl: iso(Date.now() + 2 * DIA_MS), montoCentavos: 3000 });
      const rp = await pagarVencimiento({ id: c.id, key: `h3-pag-${Date.now()}` });
      expect(rp.status).toBe(200);
      expect(await marcarAvisados([c.id], iso(Date.now()))).toEqual([]);

      await db.delete(cashDueItems).where(eq(cashDueItems.id, a.id));
      await db.delete(cashDueItems).where(eq(cashDueItems.id, b.id));
      await db.delete(cashDueItems).where(eq(cashDueItems.id, c.id));
    } finally {
      delete process.env.TENANT_DATABASE_URL;
    }
  });

  it("H3: fallo de DB devuelve [] sin marcar memoria", async () => {
    const { crearVencimiento, marcarAvisados } = await import("../src/lib/repos/caja.js");
    const { crearAlmacenVencimientosCaja } = await import("../src/lib/repos/_almacen.js");
    modoSingle();
    resetStore();
    process.env.TENANT_DATABASE_URL = "postgres://postgres:postgres@base.invalid:5432/base_muerta";
    try {
      const d = await crearVencimiento({ concepto: "H3-fallo", venceEl: iso(Date.now() + 2 * DIA_MS), montoCentavos: 1000 });
      expect(crearAlmacenVencimientosCaja().obtener(d.id)?.avisadoEl ?? null).toBeNull();
      expect(await marcarAvisados([d.id], iso(Date.now()))).toEqual([]);
      expect(crearAlmacenVencimientosCaja().obtener(d.id)?.avisadoEl ?? null).toBeNull();
    } finally {
      delete process.env.TENANT_DATABASE_URL;
    }
  });
});
