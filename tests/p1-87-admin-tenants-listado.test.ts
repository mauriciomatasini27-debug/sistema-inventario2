import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, type ControlTenant } from "../src/lib/store.js";
import { resetAdmin } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { listarYSincronizarTenantsControl, persistirEstadoTenant } from "../src/lib/control-db.js";
import { GET as GETTenants, POST as POSTTenants } from "../src/pages/api/admin/tenants.js";

type Fila = {
  id: string;
  nombreComercio: string;
  slug: string;
  estado: string;
  plan: string;
  moneda: string;
  ownerGoogleSub: string | null;
  esDemo: boolean;
  rubro: string | null;
  trialHasta: Date | null;
};

const dbFake = vi.hoisted(() => ({
  filas: null as Fila[] | null,
  updates: [] as Array<{ estado: string }>,
}));

vi.mock("../src/lib/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/db.js")>();
  const entonces = (resultado: unknown) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.from = self;
    q.leftJoin = self;
    q.where = self;
    q.limit = () => {
      throw new Error("sin contador en el fake");
    };
    q.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, err);
    return q;
  };
  return {
    ...actual,
    getControlDb: () => {
      if (dbFake.filas === null) throw new Error("Falta CONTROL_DATABASE_URL");
      return {
        select: () => entonces(dbFake.filas),
        update: () => {
          const q: Record<string, unknown> = {};
          q.set = (v: { estado: string }) => {
            dbFake.updates.push({ estado: v.estado });
            return q;
          };
          q.where = () => q;
          q.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(undefined).then(ok, err);
          return q;
        },
      };
    },
  };
});

function adminSesion(sub: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: null,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function req(url: string, plano: string, body?: unknown) {
  return ctx(url, {
    method: body ? "POST" : "GET",
    ...(body !== undefined ? { body: body as Record<string, unknown> } : {}),
    headers: { cookie: `__Host-sesion=${plano}` },
  });
}

function tenant(id: string, extra: Partial<ControlTenant> = {}): ControlTenant {
  return {
    id,
    nombreComercio: "Kiosco",
    slug: id,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueno-1",
    esDemo: false,
    ...extra,
  };
}

function fila(parcial: Partial<Fila> & { id: string }): Fila {
  return {
    nombreComercio: "Kiosco",
    slug: parcial.id,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueno-1",
    esDemo: false,
    rubro: null,
    trialHasta: null,
    ...parcial,
  };
}

beforeEach(() => {
  resetStore();
  resetAdmin();
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
  dbFake.filas = null;
  dbFake.updates = [];
});

describe("P1-87 admin ve y edita tenants", () => {
  it("sin base el Map sigue listando el nombre", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", tenant("t1", { nombreComercio: "Kiosco Lo de Mauri" }));
    const g = (await GETTenants(req("http://x/api/admin/tenants", plano))) as Response;
    expect(g.status).toBe(200);
    const body = await g.json();
    expect(body.tenants).toEqual([
      expect.objectContaining({ id: "t1", nombre: "Kiosco Lo de Mauri", slug: "t1", estado: "activo", plan: "base" }),
    ]);
    expect(body.tenants[0].email).toBeUndefined();
    expect(await persistirEstadoTenant("t1", "suspendido")).toBe(false);
    expect(dbFake.updates).toEqual([]);
  });

  it("una fila de DB llena el Map vacío y el GET devuelve nombre y vencimiento", async () => {
    const hasta = new Date("2026-12-01T03:00:00.000Z");
    dbFake.filas = [fila({ id: "db-1", nombreComercio: "Almacén Don Pepe", trialHasta: hasta })];
    expect(await listarYSincronizarTenantsControl()).toBe(1);
    expect(control.tenants.get("db-1")).toMatchObject({
      nombreComercio: "Almacén Don Pepe",
      estado: "activo",
      trialHasta: hasta.toISOString(),
    });
    const plano = adminSesion("admin-1");
    const g = (await GETTenants(req("http://x/api/admin/tenants", plano))) as Response;
    expect(g.status).toBe(200);
    const body = await g.json();
    expect(body.tenants).toEqual([
      expect.objectContaining({
        id: "db-1",
        nombre: "Almacén Don Pepe",
        vencimiento: hasta.toISOString(),
        estado: "activo",
      }),
    ]);
  });

  it("un tenant solo-memoria sobrevive si la DB vuelve vacía o sin esa fila", async () => {
    control.tenants.set("mem", tenant("mem", { nombreComercio: "Solo memoria", requestKey: "rk" }));
    dbFake.filas = [];
    expect(await listarYSincronizarTenantsControl()).toBe(0);
    expect(control.tenants.get("mem")?.nombreComercio).toBe("Solo memoria");
    dbFake.filas = [fila({ id: "db-2", nombreComercio: "Otro" })];
    await listarYSincronizarTenantsControl();
    expect(control.tenants.get("mem")?.requestKey).toBe("rk");
    expect(control.tenants.get("db-2")?.nombreComercio).toBe("Otro");
  });

  it("la DB pisa estado, nombre, rubro y trial, y deja moneda y requestKey de memoria", async () => {
    control.tenants.set(
      "t1",
      tenant("t1", {
        estado: "activo",
        nombreComercio: "Viejo",
        moneda: "USD",
        rubro: "kiosco",
        requestKey: "rk",
        trialHasta: "2020-01-01T00:00:00.000Z",
      }),
    );
    dbFake.filas = [fila({ id: "t1", estado: "suspendido", nombreComercio: "Nuevo", moneda: "ARS", rubro: null, trialHasta: null })];
    await listarYSincronizarTenantsControl();
    const t = control.tenants.get("t1");
    expect(t).toMatchObject({ estado: "suspendido", nombreComercio: "Nuevo", moneda: "USD", requestKey: "rk" });
    expect(t?.rubro).toBeUndefined();
    expect(t?.trialHasta).toBeUndefined();
  });

  it("lista vacía responde 200 con tenants vacío", async () => {
    dbFake.filas = [];
    const plano = adminSesion("admin-1");
    const g = (await GETTenants(req("http://x/api/admin/tenants", plano))) as Response;
    expect(g.status).toBe(200);
    expect(await g.json()).toEqual({ tenants: [] });
  });

  it("suspender cambia el Map, escribe el estado una vez y el repetido es 409", async () => {
    dbFake.filas = [];
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", tenant("t1"));
    control.tenants.set("t2", tenant("t2", { nombreComercio: "Otro" }));
    const s = (await POSTTenants(
      req("http://x/api/admin/tenants", plano, { tenant_id: "t1", accion: "suspender", confirmo_id: "t1", motivo: "mora" }),
    )) as Response;
    expect(s.status).toBe(200);
    expect(await s.json()).toMatchObject({ tenant_id: "t1", estado: "suspendido" });
    expect(control.tenants.get("t1")?.estado).toBe("suspendido");
    expect(control.tenants.get("t2")?.estado).toBe("activo");
    await vi.waitFor(() => expect(dbFake.updates).toEqual([{ estado: "suspendido" }]));
    const s2 = (await POSTTenants(
      req("http://x/api/admin/tenants", plano, { tenant_id: "t1", accion: "suspender", confirmo_id: "t1", motivo: "otra" }),
    )) as Response;
    expect(s2.status).toBe(409);
    expect(await s2.json()).toMatchObject({ error: "ya suspendido" });
    expect(dbFake.updates).toEqual([{ estado: "suspendido" }]);
    const r = (await POSTTenants(
      req("http://x/api/admin/tenants", plano, { tenant_id: "t1", accion: "reactivar", confirmo_id: "t1", motivo: "pago" }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(control.tenants.get("t1")?.estado).toBe("activo");
    await vi.waitFor(() => expect(dbFake.updates).toEqual([{ estado: "suspendido" }, { estado: "activo" }]));
  });

  it("un id que solo está en la DB se suspende en el primer POST", async () => {
    dbFake.filas = [fila({ id: "frio", nombreComercio: "Frío", estado: "activo" })];
    const plano = adminSesion("admin-1");
    const s = (await POSTTenants(
      req("http://x/api/admin/tenants", plano, { tenant_id: "frio", accion: "suspender", confirmo_id: "frio", motivo: "mora" }),
    )) as Response;
    expect(s.status).toBe(200);
    expect(control.tenants.get("frio")?.estado).toBe("suspendido");
    expect(control.tenants.get("frio")?.nombreComercio).toBe("Frío");
  });

  it("sin admin el listado es 403", async () => {
    const plano = adminSesion("visitante");
    const g = (await GETTenants(req("http://x/api/admin/tenants", plano))) as Response;
    expect(g.status).toBe(403);
  });

  it("el panel nombra la tabla y GET/POST /api/admin/tenants", () => {
    const html = readFileSync(new URL("../src/pages/admin.astro", import.meta.url), "utf8");
    expect(html).toContain('id="tenants-tabla"');
    expect(html).toContain("GET/POST /api/admin/tenants");
    expect(html).toContain('fetch("/api/admin/tenants"');
  });
});
