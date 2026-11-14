import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { rehidratarMembresias, type FilaMembresiaDurable } from "../src/lib/rehidratar-membresia.js";
import { plantilla_productos_rubro } from "../src/modules/onboarding/plantillas-productos-rubro.js";
import { GET as getPlantilla } from "../src/pages/api/stock/plantilla.js";
import { POST as postAlta } from "../src/pages/api/onboarding/alta.js";
import { control, resetStore } from "../src/lib/store.js";

const SUB = "dueno-rubro";

function sesion(sub: string, tenantId: string | null = null) {
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

function filaMembresia(tenantId: string, rubro: string | null): FilaMembresiaDurable {
  return {
    id: `mem-${tenantId}`,
    tenantId,
    googleSub: SUB,
    rol: "dueno",
    permisos: [],
    puedeUsarBot: true,
    nombreComercio: `Comercio ${tenantId}`,
    slug: tenantId,
    estadoTenant: "activo",
    plan: "demo",
    moneda: "ARS",
    ownerGoogleSub: SUB,
    esDemo: true,
    rubro,
    requestKey: null,
    trialHasta: null,
  };
}

async function plantillaDe(tenantId: string, rubroEsperado?: string) {
  const plano = sesion(SUB, tenantId);
  control.memberships.set(`m-${tenantId}`, {
    id: `m-${tenantId}`,
    tenantId,
    googleSub: SUB,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  const r = await getPlantilla(ctx("http://x/api/stock/plantilla", { headers: { cookie: `__Host-sesion=${plano}` } }));
  expect(r.status).toBe(200);
  const j = (await r.json()) as { rubro: string; productos: string[] };
  if (rubroEsperado !== undefined) {
    expect(j.rubro).toBe(rubroEsperado);
    expect(j.productos).toEqual(plantilla_productos_rubro(rubroEsperado).productos);
  }
  return j;
}

describe("P1-78 persistencia del rubro por comercio", () => {
  beforeEach(() => {
    resetStore();
  });

  it("el alta deja el rubro en memoria", async () => {
    const plano = sesion(SUB);
    const r = await postAlta(
      ctx("http://x/api/onboarding/alta", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
        body: { nombre_comercio: "Kiosco Rubro", rubro: "kiosco", request_key: "rubro-1" },
      }),
    );
    expect(r.status).toBe(201);
    const { tenant_id } = (await r.json()) as { tenant_id: string };
    expect(control.tenants.get(tenant_id)?.rubro).toBe("kiosco");
  });

  it("rechaza rubro inválido en el alta", async () => {
    const plano = sesion(SUB);
    const r = await postAlta(
      ctx("http://x/api/onboarding/alta", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
        body: { nombre_comercio: "X", rubro: "panaderia", request_key: "rubro-inv" },
      }),
    );
    expect(r.status).toBe(422);
  });

  it("tras reinicio simulado rehidrata el rubro y la plantilla coincide", async () => {
    await rehidratarMembresias(SUB, async () => [filaMembresia("tenant-a", "almacen")]);
    await plantillaDe("tenant-a", "almacen");
  });

  it("comercio viejo sin rubro usa otro en la plantilla", async () => {
    await rehidratarMembresias(SUB, async () => [filaMembresia("tenant-viejo", null)]);
    await plantillaDe("tenant-viejo", "otro");
  });

  it("aislamiento A/B: cada comercio conserva su rubro", async () => {
    await rehidratarMembresias(SUB, async () => [
      filaMembresia("tenant-a", "kiosco"),
      filaMembresia("tenant-b", "libreria"),
    ]);

    const ja = await plantillaDe("tenant-a", "kiosco");
    const jb = await plantillaDe("tenant-b", "libreria");
    expect(ja.productos).not.toEqual(jb.productos);
    expect(control.tenants.get("tenant-a")?.rubro).toBe("kiosco");
    expect(control.tenants.get("tenant-b")?.rubro).toBe("libreria");
  });
});