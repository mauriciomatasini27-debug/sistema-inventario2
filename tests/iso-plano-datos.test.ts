import { afterEach, describe, expect, it } from "vitest";
import { conTenant, tenantActual } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { gateTenantDatos } from "../src/lib/tenant-context.js";

const TA = "tenant-a";

afterEach(() => {
  delete process.env.TENANT_MODE;
  delete process.env[`TENANT_DATABASE_URL_${TA}`];
});

describe("ISO-S5 contexto de tenant por request", () => {
  it("conTenant expone el tenant dentro y undefined fuera", () => {
    expect(tenantActual()).toBeUndefined();
    const visto = conTenant(TA, () => tenantActual());
    expect(visto).toBe(TA);
    expect(tenantActual()).toBeUndefined();
  });
});

describe("ISO-S6 getTenantDb desde el contexto", () => {
  it("en multi usa la base del tenant dentro del contexto y lanza fuera", () => {
    process.env.TENANT_MODE = "multi";
    process.env[`TENANT_DATABASE_URL_${TA}`] = "postgres://127.0.0.1:1/tenant_a";
    expect(() => conTenant(TA, () => getTenantDb())).not.toThrow();
    expect(() => getTenantDb()).toThrow(/Falta tenant/);
  });
});

describe("ISO-S5 gate de rutas de datos", () => {
  it("en multi sin sesion responde 403 en /api/sales y /api/cash/balance", () => {
    process.env.TENANT_MODE = "multi";
    for (const path of ["/api/sales", "/api/cash/balance"]) {
      const r = gateTenantDatos(new Request(`http://x${path}`), path);
      expect(r?.ok).toBe(false);
      if (r && !r.ok) expect(r.respuesta.status).toBe(403);
      else throw new Error(`esperaba 403 para ${path}`);
    }
  });

  it("devuelve null fuera de rutas de datos", () => {
    process.env.TENANT_MODE = "multi";
    expect(gateTenantDatos(new Request("http://x/api/health"), "/api/health")).toBeNull();
  });

  it("en single responde ok con tenantId como hoy", () => {
    const r = gateTenantDatos(new Request("http://x/api/sales"), "/api/sales");
    expect(r?.ok).toBe(true);
    if (r && r.ok) expect(typeof r.tenantId).toBe("string");
    else throw new Error("esperaba ok en single");
  });
});
