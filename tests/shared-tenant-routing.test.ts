import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { conTenant, esModoShared, esModoAisladoPorTenant } from "../src/lib/tenant-mode.js";
import { esSingle, tenantDeRequest } from "../src/lib/tenant-context.js";
import { getTenantDb } from "../src/lib/db.js";
import { POST as postAlta } from "../src/pages/api/onboarding/alta.js";
import { GET as getHealth } from "../src/pages/api/health.js";

function sesionEnStore(sub: string, tenantId: string | null = null) {
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

const ENV_KEYS = [
  "TENANT_MODE",
  "CONTROL_DATABASE_URL",
  "TENANT_DATABASE_URL",
  "GOOGLE_LOGIN_CLIENT_ID",
  "GOOGLE_LOGIN_CLIENT_SECRET",
  "GOOGLE_LOGIN_REDIRECT",
  "JOBS_SECRET",
] as const;

const prev: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  resetStore();
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  process.env.TENANT_MODE = "shared";
  process.env.CONTROL_DATABASE_URL = "postgres://control";
  process.env.TENANT_DATABASE_URL = "postgres://shared";
  process.env.GOOGLE_LOGIN_CLIENT_ID = "id";
  process.env.GOOGLE_LOGIN_CLIENT_SECRET = "sec";
  process.env.GOOGLE_LOGIN_REDIRECT = "https://x/api/auth/callback";
  process.env.JOBS_SECRET = "jobs";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = prev[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetStore();
});

describe("ADR-0116 C2 TENANT_MODE=shared routing", () => {
  it("shared no es single y aísla por tenant", () => {
    expect(esModoShared()).toBe(true);
    expect(esModoAisladoPorTenant()).toBe(true);
    expect(esSingle()).toBe(false);
  });

  it("sin sesión en ruta de datos responde 403 (no slice0)", () => {
    const r = tenantDeRequest(new Request("http://x/api/products"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.respuesta.status).toBe(403);
  });

  it("alta deja UUID en la sesión y health ve la URL compartida", async () => {
    const plano = sesionEnStore("dueno-shared-1");
    const r = await postAlta(
      ctx("http://x/api/onboarding/alta", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
        body: {
          nombre_comercio: "Kiosco Shared",
          rubro: "kiosco",
          request_key: "c2-shared-1",
        },
      }),
    );
    expect(r.status).toBeLessThan(400);
    const ses = [...control.sessions.values()].find((s) => s.googleSub === "dueno-shared-1");
    expect(ses?.tenantId).toBeTruthy();
    expect(ses?.tenantId).not.toBe("slice0");
    expect(ses?.tenantId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const h = await getHealth(ctx("http://x/api/health", { method: "GET" }));
    expect(h.status).toBe(200);
    const j = (await h.json()) as { tieneDb?: boolean };
    expect(j.tieneDb).toBe(true);
  });

  it("memoria no comparte stock entre dos tenants", () => {
    conTenant("tenant-a", () => {
      store.stock.set("sku-x", 7);
    });
    conTenant("tenant-b", () => {
      store.stock.set("sku-x", 3);
    });
    expect(conTenant("tenant-a", () => store.stock.get("sku-x"))).toBe(7);
    expect(conTenant("tenant-b", () => store.stock.get("sku-x"))).toBe(3);
  });

  it("getTenantDb en shared sin contexto lanza; con contexto usa la URL compartida", () => {
    expect(() => getTenantDb()).toThrow(/Falta tenant/);
    process.env.TENANT_DATABASE_URL_tenant_a = "postgres://otra";
    expect(() => conTenant("tenant-a", () => getTenantDb())).not.toThrow();
    delete process.env.TENANT_DATABASE_URL_tenant_a;
    expect(() => conTenant("tenant-a", () => getTenantDb())).not.toThrow();
  });
});
