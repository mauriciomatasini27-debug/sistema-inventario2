import { beforeEach, describe, expect, it } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion, sha256Hex } from "../src/modules/auth/sesiones.js";
import { POST as POSTGrants, DELETE as DELETEGrants } from "../src/pages/api/sync/offline-grants.js";
import { POST as POSTRegister } from "../src/pages/api/devices/register.js";
import { POST as POSTClose } from "../src/pages/api/cash/close.js";
import { POST as POSTReversal } from "../src/pages/api/cash/reversals.js";
import { puedeOperarOffline, verificarGrantOffline } from "../src/offline/grants.js";
import { exigirOnlineParaSensible } from "../src/lib/offline-gate.js";
import type { OfflineGrant } from "../src/offline/types.js";

function sesion(sub: string, tenantId: string | null) {
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
  return c;
}

function tenantConMiembro(id: string, sub: string, rol: "dueno" | "empleado" = "dueno") {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco La Esquina",
    slug: "kiosco-la-esquina",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  const mid = `m-${sub}`;
  control.memberships.set(mid, { id: mid, tenantId: id, googleSub: sub, rol, permisos: [], estado: "activo" });
}

function reqJson(url: string, body: unknown, plano?: string): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(plano ? { cookie: `__Host-sesion=${plano}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => resetStore());

describe("offline grants SYNC-S5/S7 (OF9)", () => {
  it("sin sesión => 403 (emisión solo online)", async () => {
    const res = (await POSTGrants({
      request: reqJson("http://x/api/sync/offline-grants", { tenant_id: "t1", device_code: "caja-01", alcance: "venta" }),
    } as never)) as Response;
    expect(res.status).toBe(403);
  });

  it("miembro activo obtiene grant 72h def y opera offline en su alcance", async () => {
    tenantConMiembro("t1", "dueno-1");
    const s = sesion("dueno-1", "t1");
    const res = (await POSTGrants({
      request: reqJson(
        "http://x/api/sync/offline-grants",
        { tenant_id: "t1", device_code: "caja-01", alcance: "venta" },
        s.idPlano,
      ),
    } as never)) as Response;
    expect(res.status).toBe(201);
    const j = (await res.json()) as Record<string, string>;
    expect(j["grant_id"]).toBeTruthy();
    // SYNC-S7: token JWT HS256 verificable offline (3 segmentos punto).
    expect(j["token"]).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const verificado = await verificarGrantOffline(j["token"]!);
    expect(verificado?.grantId).toBe(j["grant_id"]);
    expect(verificado?.alcance).toBe("venta");
    const grant: OfflineGrant = {
      grantId: j["grant_id"]!,
      deviceCode: "caja-01",
      alcance: "venta",
      expiraEn: j["expira_en"]!,
    };
    expect(puedeOperarOffline(grant, "venta")).toBe(true);
    expect(puedeOperarOffline(grant, "caja")).toBe(false);
  });

  it("alcance sensible (no enum) => 422; vencimiento fuera de 24-168 => 422", async () => {
    tenantConMiembro("t1", "dueno-1");
    const s = sesion("dueno-1", "t1");
    const r1 = (await POSTGrants({
      request: reqJson(
        "http://x/api/sync/offline-grants",
        { tenant_id: "t1", device_code: "caja-01", alcance: "sueldos" },
        s.idPlano,
      ),
    } as never)) as Response;
    expect(r1.status).toBe(422);
    const r2 = (await POSTGrants({
      request: reqJson(
        "http://x/api/sync/offline-grants",
        { tenant_id: "t1", device_code: "caja-01", alcance: "venta", vence_en_horas: 1 },
        s.idPlano,
      ),
    } as never)) as Response;
    expect(r2.status).toBe(422);
  });

  it("revocar => cuarentena (grant marcado, dueño o propio)", async () => {
    tenantConMiembro("t1", "dueno-1");
    const s = sesion("dueno-1", "t1");
    const c = (await POSTGrants({
      request: reqJson(
        "http://x/api/sync/offline-grants",
        { tenant_id: "t1", device_code: "caja-01", alcance: "caja" },
        s.idPlano,
      ),
    } as never)) as Response;
    const j = (await c.json()) as Record<string, string>;
    const del = (await DELETEGrants({
      request: new Request(`http://x/api/sync/offline-grants?grant_id=${j["grant_id"]}`, {
        method: "DELETE",
        headers: { cookie: `__Host-sesion=${s.idPlano}` },
      }),
    } as never)) as Response;
    expect(del.status).toBe(200);
    expect(control.offlineGrants.get(j["grant_id"]!)?.revocadoEn).toBeTruthy();
  });
});

describe("devices register SYNC-S6 (OF9)", () => {
  it("sin sesión => 403", async () => {
    const res = (await POSTRegister({
      request: reqJson("http://x/api/devices/register", { tenant_id: "t1", device_code: "caja-01" }),
    } as never)) as Response;
    expect(res.status).toBe(403);
  });

  it("registra 201, replay 200, otro tenant 409", async () => {
    tenantConMiembro("t1", "dueno-1");
    tenantConMiembro("t2", "dueno-2");
    control.memberships.set("m-dueno-1-t2", { id: "m-dueno-1-t2", tenantId: "t2", googleSub: "dueno-1", rol: "empleado", permisos: [], estado: "activo" });
    const s = sesion("dueno-1", "t1");
    const r1 = (await POSTRegister({
      request: reqJson("http://x/api/devices/register", { tenant_id: "t1", device_code: "caja-01", nombre: "Mostrador" }, s.idPlano),
    } as never)) as Response;
    expect(r1.status).toBe(201);
    expect(control.deviceNames.get("caja-01")).toBe("Mostrador");
    const r2 = (await POSTRegister({
      request: reqJson("http://x/api/devices/register", { tenant_id: "t1", device_code: "caja-01" }, s.idPlano),
    } as never)) as Response;
    expect(r2.status).toBe(200);
    const r3 = (await POSTRegister({
      request: reqJson("http://x/api/devices/register", { tenant_id: "t2", device_code: "caja-01" }, s.idPlano),
    } as never)) as Response;
    expect(r3.status).toBe(409);
  });
});
