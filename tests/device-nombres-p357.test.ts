import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { devices } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as GETSesiones } from "../src/pages/api/auth/sesiones.js";
import { POST as POSTNombrar } from "../src/pages/api/devices/nombrar.js";
import { POST as POSTRegister } from "../src/pages/api/devices/register.js";

// #357 / P10-34: el nombre del device deja de vivir solo en control.deviceNames.
// Con base viva se persiste en devices.nombre y se relee de ahí; en single sin
// base el mapa sigue siendo la fuente; en multi sin base la ruta responde 503.

const PG = process.env.PG_TEST_URL_A;
const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "DEFAULT_TENANT_ID"] as const;

function urlsDeTenant(): string[] {
  return Object.keys(process.env).filter((k) => k.startsWith("TENANT_DATABASE_URL_"));
}

function guardarEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of [...ENV_KEYS, ...urlsDeTenant()]) snap[k] = process.env[k];
  return snap;
}

function restaurarEnv(snap: Record<string, string | undefined>): void {
  const actuales = new Set([...ENV_KEYS, ...urlsDeTenant()]);
  for (const k of actuales) if (!(k in snap)) delete process.env[k];
  for (const [k, v] of Object.entries(snap)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function sinBase(): void {
  for (const k of urlsDeTenant()) delete process.env[k];
  delete process.env.TENANT_DATABASE_URL;
}

function tenantConDueno(tenantId: string, sub: string): void {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco #357",
    slug: "kiosco-357",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  const mid = `m-${sub}`;
  control.memberships.set(mid, { id: mid, tenantId, googleSub: sub, rol: "dueno", permisos: [], estado: "activo" });
}

function sesion(sub: string, tenantId: string, dispositivoCodigo: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    dispositivoCodigo,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function reqJson(url: string, body: Record<string, unknown>, plano: string) {
  return ctx(url, {
    method: "POST",
    body,
    headers: { cookie: `__Host-sesion=${plano}` },
  });
}

function reqGet(url: string, plano: string) {
  return ctx(url, { method: "GET", headers: { cookie: `__Host-sesion=${plano}` } });
}

describe.skipIf(!PG)("#357 nombre de device persistido en devices (PG)", () => {
  const tenantId = randomUUID();
  const deviceCode = `caja-${randomUUID().slice(0, 8)}`;
  const deviceRegistro = `caja-reg-${randomUUID().slice(0, 8)}`;
  let snap: Record<string, string | undefined> = {};

  beforeEach(async () => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = PG ?? "";
    sinBaseTenantsAislados();
  });

  afterEach(async () => {
    restaurarEnv(snap);
    resetStore();
  });

  function sinBaseTenantsAislados(): void {
    for (const k of urlsDeTenant()) delete process.env[k];
  }

  async function nombreEnDb(codigo: string): Promise<string | null> {
    const filas = await conTenant(tenantId, () =>
      getTenantDb()
        .select({ nombre: devices.nombre })
        .from(devices)
        .where(and(eq(devices.tenantId, tenantId), eq(devices.deviceCode, codigo)))
        .limit(1),
    );
    return filas[0]?.nombre ?? null;
  }

  async function sembrarDevice(codigo: string): Promise<void> {
    await conTenant(tenantId, () =>
      getTenantDb()
        .insert(devices)
        .values({ tenantId, deviceCode: codigo, plataforma: "web", appVersion: "1" })
        .onConflictDoNothing(),
    );
  }

  async function limpiarDevice(codigo: string): Promise<void> {
    await conTenant(tenantId, () =>
      getTenantDb()
        .delete(devices)
        .where(and(eq(devices.tenantId, tenantId), eq(devices.deviceCode, codigo))),
    );
  }

  it("nombrar persiste en devices.nombre y se relee de DB tras vaciar la memoria", async () => {
    await sembrarDevice(deviceCode);
    try {
      tenantConDueno(tenantId, "dueno-357");
      const plano = sesion("dueno-357", tenantId, deviceCode);
      const r = (await conTenant(tenantId, () =>
        POSTNombrar(
          reqJson("http://x/api/devices/nombrar", { tenant_id: tenantId, device_code: deviceCode, nombre: "Mostrador" }, plano),
        ),
      )) as Response;
      expect(r.status).toBe(200);
      expect(await nombreEnDb(deviceCode)).toBe("Mostrador");

      // Simula un reinicio del proceso: memoria sin nombres, sesión rehidratada.
      resetStore();
      tenantConDueno(tenantId, "dueno-357");
      const plano2 = sesion("dueno-357", tenantId, deviceCode);
      expect(control.deviceNames.has(deviceCode)).toBe(false);
      const res = (await conTenant(tenantId, () => GETSesiones(reqGet("http://x/api/auth/sesiones", plano2)))) as Response;
      expect(res.status).toBe(200);
      const j = (await res.json()) as { sesiones: Array<{ dispositivo: string }> };
      expect(j.sesiones[0]?.dispositivo).toBe("Mostrador");
    } finally {
      await limpiarDevice(deviceCode);
    }
  });

  it("register con nombre también persiste en devices.nombre", async () => {
    try {
      tenantConDueno(tenantId, "dueno-357-reg");
      const plano = sesion("dueno-357-reg", tenantId, deviceRegistro);
      const r = (await conTenant(tenantId, () =>
        POSTRegister(
          reqJson(
            "http://x/api/devices/register",
            { tenant_id: tenantId, device_code: deviceRegistro, nombre: "Caja 2" },
            plano,
          ),
        ),
      )) as Response;
      expect(r.status).toBe(201);
      expect(await nombreEnDb(deviceRegistro)).toBe("Caja 2");
    } finally {
      await limpiarDevice(deviceRegistro);
    }
  });
});

describe("#357 sin base en single", () => {
  let snap: Record<string, string | undefined> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    delete process.env.TENANT_MODE;
    sinBase();
  });

  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  it("nombrar cae al espejo en memoria y responde 200", async () => {
    tenantConDueno("t357-single", "dueno-single");
    const plano = sesion("dueno-single", "t357-single", "caja-single");
    const r = (await POSTNombrar(
      reqJson(
        "http://x/api/devices/nombrar",
        { tenant_id: "t357-single", device_code: "caja-single", nombre: "Mostrador" },
        plano,
      ),
    )) as Response;
    expect(r.status).toBe(200);
    expect(control.deviceNames.get("caja-single")).toBe("Mostrador");
  });
});

describe("#357 multi sin base", () => {
  let snap: Record<string, string | undefined> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "multi";
    sinBase();
  });

  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  it("nombrar responde 503 base_no_disponible sin tocar el espejo", async () => {
    tenantConDueno("t357-multi", "dueno-multi");
    const plano = sesion("dueno-multi", "t357-multi", "caja-multi");
    const r = (await POSTNombrar(
      reqJson(
        "http://x/api/devices/nombrar",
        { tenant_id: "t357-multi", device_code: "caja-multi", nombre: "Mostrador" },
        plano,
      ),
    )) as Response;
    expect(r.status).toBe(503);
    expect((await r.json()) as { error: string }).toEqual({ error: "base_no_disponible" });
    expect(control.deviceNames.has("caja-multi")).toBe(false);
  });
});
