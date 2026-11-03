import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as getSesion } from "../src/pages/api/auth/sesion-actual.js";

// P1-35: el panel nombra el comercio; la sesión expone el mismo dato.
function leer(path: string): string {
  return readFileSync(path, "utf8");
}

function sesionConTenant(sub: string, tenantId: string) {
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

beforeEach(() => {
  resetStore();
});

describe("P1-35 nombre del comercio en panel y sesión", () => {
  it("panel.astro usa nombreComercio en saludo y título", () => {
    const panel = leer("src/pages/panel.astro");
    expect(panel).toContain("nombreComercio");
    expect(panel).toContain("tituloPanel");
    expect(panel).toMatch(/Hola\{nombreComercio/);
  });

  it("sesion-actual incluye tenant_id y nombre_comercio", async () => {
    control.tenants.set("t-kiosco", {
      id: "t-kiosco",
      nombreComercio: "Kiosco Lo de Mauri",
      slug: "kiosco-lo-de-mauri",
      estado: "activo",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: "dueno-1",
      esDemo: true,
    });
    const plano = sesionConTenant("dueno-1", "t-kiosco");
    const r = (await getSesion(
      ctx("http://x/api/auth/sesion-actual", {
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    )) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as {
      logueado: boolean;
      tenant_id: string | null;
      nombre_comercio: string | null;
    };
    expect(j.logueado).toBe(true);
    expect(j.tenant_id).toBe("t-kiosco");
    expect(j.nombre_comercio).toBe("Kiosco Lo de Mauri");
  });
});
