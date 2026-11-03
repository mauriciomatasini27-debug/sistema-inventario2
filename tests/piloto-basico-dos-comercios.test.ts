import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as postAlta } from "../src/pages/api/onboarding/alta.js";
import { POST as postTenants } from "../src/pages/api/tenants.js";

// P1-32: misma secuencia que el botón de /admin (keys fijas del piloto).
const KEY_T1 = "piloto-basico-t1";
const KEY_T2 = "piloto-basico-t2";
const OWNER_T2 = "piloto-basico-t2";
const SUB_ADMIN = "piloto-admin-sub";

function sesionEnStore(sub: string) {
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

function conCookie(plano: string, body: Record<string, unknown>) {
  return ctx("http://x/api", {
    method: "POST",
    headers: { cookie: `__Host-sesion=${plano}`, "Content-Type": "application/json" },
    body,
  });
}

describe("P1-32 cargar 2 comercios piloto", () => {
  const prevAllow = process.env.ADMIN_ALLOWLIST_SUBS;

  beforeEach(() => {
    resetStore();
    process.env.ADMIN_ALLOWLIST_SUBS = SUB_ADMIN;
  });

  afterEach(() => {
    if (prevAllow === undefined) delete process.env.ADMIN_ALLOWLIST_SUBS;
    else process.env.ADMIN_ALLOWLIST_SUBS = prevAllow;
  });

  it("alta + tenants con keys piloto aceptan 201|409 y reusan el mismo tenant_id", async () => {
    const plano = sesionEnStore(SUB_ADMIN);

    const a1 = (await postAlta(
      conCookie(plano, {
        nombre_comercio: "Kiosco Lo de Mauri",
        rubro: "kiosco",
        request_key: KEY_T1,
      }),
    )) as Response;
    expect([201, 409]).toContain(a1.status);
    const j1 = (await a1.json()) as { tenant_id: string };
    expect(typeof j1.tenant_id).toBe("string");

    const a1b = (await postAlta(
      conCookie(plano, {
        nombre_comercio: "Kiosco Lo de Mauri",
        rubro: "kiosco",
        request_key: KEY_T1,
      }),
    )) as Response;
    expect(a1b.status).toBe(409);
    expect(((await a1b.json()) as { tenant_id: string }).tenant_id).toBe(j1.tenant_id);

    const a2 = (await postTenants(
      conCookie(plano, {
        nombre_comercio: "Almacén Don Pepe",
        plan: "base",
        moneda: "ARS",
        owner_google_sub: OWNER_T2,
        request_key: KEY_T2,
      }),
    )) as Response;
    expect([201, 409]).toContain(a2.status);
    const j2 = (await a2.json()) as { tenant_id: string };
    expect(typeof j2.tenant_id).toBe("string");
    expect(j2.tenant_id).not.toBe(j1.tenant_id);

    const a2b = (await postTenants(
      conCookie(plano, {
        nombre_comercio: "Almacén Don Pepe",
        plan: "base",
        moneda: "ARS",
        owner_google_sub: OWNER_T2,
        request_key: KEY_T2,
      }),
    )) as Response;
    expect(a2b.status).toBe(409);
    expect(((await a2b.json()) as { tenant_id: string }).tenant_id).toBe(j2.tenant_id);

    expect(control.tenants.size).toBe(2);
    expect(control.tenants.get(j1.tenant_id)?.plan).toBe("demo");
    expect(control.tenants.get(j2.tenant_id)?.plan).toBe("base");
  });
});
