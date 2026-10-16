import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { deviceSyncState, offlineGrants } from "../src/db/schema-sync.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { verificarGrantOffline } from "../src/offline/grants.js";
import { POST as POSTGrants, DELETE as DELETEGrants } from "../src/pages/api/sync/offline-grants.js";
import { POST as POSTRegister } from "../src/pages/api/devices/register.js";
import { grantEstaRevocado, leerDevice, leerGrant } from "../src/lib/repos/sync.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function tenantConMiembro(id: string, sub: string, rol: "dueno" | "empleado" = "dueno") {
  control.tenants.set(id, {
    id,
    nombreComercio: `Comercio ${id}`,
    slug: `comercio-${id}`,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  const mid = `m-${sub}-${id}`;
  control.memberships.set(mid, { id: mid, tenantId: id, googleSub: sub, rol, permisos: [], estado: "activo" });
}

function sesionPlano(sub: string, tenantId: string | null): string {
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

function reqJson(url: string, body: unknown, plano?: string) {
  return ctx(url, {
    method: "POST",
    body: body as Record<string, unknown>,
    headers: { ...(plano ? { cookie: `__Host-sesion=${plano}` } : {}) },
  });
}

describe("SYNC-S5/S6 single sin DB: memoria manda como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("grant 201 con JWT verificable offline", async () => {
    tenantConMiembro("t1", "dueno-1");
    const plano = sesionPlano("dueno-1", "t1");
    const res = (await POSTGrants(
      reqJson("http://x/api/sync/offline-grants", { tenant_id: "t1", device_code: "caja-01", alcance: "venta" }, plano),
    )) as Response;
    expect(res.status).toBe(201);
    const j = (await res.json()) as Record<string, string>;
    expect(j["grant_id"]).toBeTruthy();
    const verificado = await verificarGrantOffline(j["token"]!);
    expect(verificado?.grantId).toBe(j["grant_id"]);
  });

  it("register 201, replay 200 mismo id, otro tenant 409", async () => {
    tenantConMiembro("t1", "dueno-1");
    tenantConMiembro("t2", "dueno-2");
    control.memberships.set("m-dueno-1-t2", { id: "m-dueno-1-t2", tenantId: "t2", googleSub: "dueno-1", rol: "empleado", permisos: [], estado: "activo" });
    const plano = sesionPlano("dueno-1", "t1");
    const r1 = (await POSTRegister(
      reqJson("http://x/api/devices/register", { tenant_id: "t1", device_code: "caja-01" }, plano),
    )) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTRegister(
      reqJson("http://x/api/devices/register", { tenant_id: "t1", device_code: "caja-01" }, plano),
    )) as Response;
    expect(r2.status).toBe(200);
    const r3 = (await POSTRegister(
      reqJson("http://x/api/devices/register", { tenant_id: "t2", device_code: "caja-01" }, plano),
    )) as Response;
    expect(r3.status).toBe(409);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
const dispositivoA = `s5d-a-${sufijo}`;
const dispositivoCon = `s5d-c-${sufijo}`;
const dispositivoB = `s5d-b-${sufijo}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

function limpiarMulti() {
  delete process.env.TENANT_MODE;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function authMemoria() {
  tenantConMiembro("tenant-a", "dueno-a");
  tenantConMiembro("tenant-b", "dueno-b");
  control.memberships.set("m-dueno-a-b", { id: "m-dueno-a-b", tenantId: "tenant-b", googleSub: "dueno-a", rol: "empleado", permisos: [], estado: "activo" });
  return { planoA: sesionPlano("dueno-a", "tenant-a"), planoB: sesionPlano("dueno-b", "tenant-b") };
}

describe.skipIf(!hayPG)("SYNC-S5/S6 durable con PG: tenant DB manda, memoria espejo", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  beforeEach(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        for (const code of [dispositivoA, dispositivoCon, dispositivoB]) {
          await db.delete(offlineGrants).where(eq(offlineGrants.deviceCode, code));
          await db.delete(deviceSyncState).where(eq(deviceSyncState.deviceCode, code));
        }
      });
    }
    limpiarMulti();
  });

  it("grant emitido en A persiste y se lee desde memoria fresca", async () => {
    const { planoA } = authMemoria();
    const creado = (await conTenant("tenant-a", () =>
      POSTGrants(reqJson("http://x/api/sync/offline-grants", { tenant_id: "tenant-a", device_code: dispositivoA, alcance: "venta" }, planoA)),
    )) as Response;
    expect(creado.status).toBe(201);
    const j = (await creado.json()) as Record<string, string>;
    const grantId = j["grant_id"]!;
    expect(grantId).toBeTruthy();

    resetStore();
    const filas = await conTenant("tenant-a", async () =>
      getTenantDb().select().from(offlineGrants).where(eq(offlineGrants.grantId, grantId)),
    );
    expect(filas.length).toBe(1);
    expect(filas[0]?.tenantId).toBe("tenant-a");

    const leido = await conTenant("tenant-a", () => leerGrant(grantId));
    expect(leido?.grantId).toBe(grantId);
    expect(leido?.fuente).toBe("db");
    expect(leido?.revocadoEn).toBeNull();
  });

  it("grant revocado en A se detecta desde memoria fresca", async () => {
    const { planoA } = authMemoria();
    const creado = (await conTenant("tenant-a", () =>
      POSTGrants(reqJson("http://x/api/sync/offline-grants", { tenant_id: "tenant-a", device_code: dispositivoA, alcance: "caja" }, planoA)),
    )) as Response;
    expect(creado.status).toBe(201);
    const grantId = ((await creado.json()) as Record<string, string>)["grant_id"]!;

    resetStore();
    authMemoria();
    const planoFresco = sesionPlano("dueno-a", "tenant-a");
    const borrado = (await conTenant("tenant-a", () =>
      DELETEGrants(
        ctx(`http://x/api/sync/offline-grants?grant_id=${grantId}`, {
          method: "DELETE",
          headers: { cookie: `__Host-sesion=${planoFresco}` },
        }),
      ),
    )) as Response;
    expect(borrado.status).toBe(200);

    resetStore();
    const revocado = await conTenant("tenant-a", () => grantEstaRevocado(grantId));
    expect(revocado).toBe(true);
  });

  it("register idempotente: replay devuelve el mismo id y crea el grant inicial en la misma tx", async () => {
    const { planoA } = authMemoria();
    const r1 = (await conTenant("tenant-a", () =>
      POSTRegister(reqJson("http://x/api/devices/register", { tenant_id: "tenant-a", device_code: dispositivoA }, planoA)),
    )) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1["device_code"]).toBe(dispositivoA);
    const grantInicial = j1["offline_grant"] as Record<string, string> | undefined;
    expect(grantInicial?.["grant_id"]).toBeTruthy();
    expect(grantInicial?.["token"]).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    resetStore();
    authMemoria();
    const planoFresco = sesionPlano("dueno-a", "tenant-a");
    const r2 = (await conTenant("tenant-a", () =>
      POSTRegister(reqJson("http://x/api/devices/register", { tenant_id: "tenant-a", device_code: dispositivoA }, planoFresco)),
    )) as Response;
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as Record<string, unknown>;
    expect(j2["device_code"]).toBe(dispositivoA);

    const visto = await conTenant("tenant-a", () => leerDevice(dispositivoA));
    expect(visto?.deviceCode).toBe(dispositivoA);
    expect(visto?.fuente).toBe("db");
  });

  it("register concurrente del mismo device deja una sola fila", async () => {
    const { planoA } = authMemoria();
    const llamadas = Array.from({ length: 5 }, () =>
      conTenant("tenant-a", () =>
        POSTRegister(reqJson("http://x/api/devices/register", { tenant_id: "tenant-a", device_code: dispositivoCon }, planoA)),
      ),
    );
    const respuestas = (await Promise.all(llamadas)) as Response[];
    for (const r of respuestas) expect([200, 201]).toContain(r.status);
    const cuerpos = (await Promise.all(respuestas.map((r) => r.json()))) as Array<Record<string, unknown>>;
    for (const c of cuerpos) expect(c["device_code"]).toBe(dispositivoCon);

    const filas = await conTenant("tenant-a", async () =>
      getTenantDb().select().from(deviceSyncState).where(eq(deviceSyncState.deviceCode, dispositivoCon)),
    );
    expect(filas.length).toBe(1);
  });

  it("tenant B no ve devices ni grants de A", async () => {
    const { planoA, planoB } = authMemoria();
    const creado = (await conTenant("tenant-a", () =>
      POSTGrants(reqJson("http://x/api/sync/offline-grants", { tenant_id: "tenant-a", device_code: dispositivoA, alcance: "venta" }, planoA)),
    )) as Response;
    expect(creado.status).toBe(201);
    const grantId = ((await creado.json()) as Record<string, string>)["grant_id"]!;
    const reg = (await conTenant("tenant-a", () =>
      POSTRegister(reqJson("http://x/api/devices/register", { tenant_id: "tenant-a", device_code: dispositivoB }, planoA)),
    )) as Response;
    expect([200, 201]).toContain(reg.status);

    const grantEnB = await conTenant("tenant-b", () => leerGrant(grantId));
    expect(grantEnB).toBeNull();
    const deviceEnB = await conTenant("tenant-b", () => leerDevice(dispositivoB));
    expect(deviceEnB).toBeNull();
    const revocadoEnB = await conTenant("tenant-b", () => grantEstaRevocado(grantId));
    expect(revocadoEnB).toBe(false);

    const borradoB = (await conTenant("tenant-b", () =>
      DELETEGrants(
        ctx(`http://x/api/sync/offline-grants?grant_id=${grantId}`, {
          method: "DELETE",
          headers: { cookie: `__Host-sesion=${planoB}` },
        }),
      ),
    )) as Response;
    expect(borradoB.status).toBe(404);
  });
});
