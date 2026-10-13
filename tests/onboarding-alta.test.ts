import { describe, expect, it, beforeEach } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as postAlta } from "../src/pages/api/onboarding/alta.js";

function sesionEnStore(sub: string, tenantId: string | null = null) {
  const ahoraReal = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora: ahoraReal });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahoraReal.toISOString(),
    reauthAt: ahoraReal.toISOString(),
  });
  return c.idPlano;
}

function req(plano: string, cuerpo: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/onboarding/alta", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}`, ...headers },
    body: JSON.stringify(cuerpo),
  });
}

beforeEach(() => {
  resetStore();
});

describe("alta autoservicio ON1", () => {
  it("201 crea comercio activo con membership de dueño y código vincular", async () => {
    const plano = sesionEnStore("dueno-1");
    const r = await postAlta({
      request: req(plano, {
        nombre_comercio: "Kiosco La Esquina",
        rubro: "kiosco",
        numero: "11 5555-1234",
        opt_in: true,
      }),
    } as never);
    expect(r.status).toBe(201);
    const j = (await r.json()) as { tenant_id: string; estado: string; vincular: { codigo: string } | null };
    expect(j.estado).toBe("activo");
    expect(j.vincular?.codigo).toMatch(/^\d{6}$/);
    const tenant = control.tenants.get(j.tenant_id);
    expect(tenant?.ownerGoogleSub).toBe("dueno-1");
    expect(tenant?.plan).toBe("demo");
    const memb = [...control.memberships.values()].find((m) => m.tenantId === j.tenant_id);
    expect(memb?.rol).toBe("dueno");
  });

  it("doble envío devuelve 409 con el mismo tenant", async () => {
    const plano = sesionEnStore("dueno-1");
    const cuerpo = { nombre_comercio: "Kiosco La Esquina", rubro: "kiosco", request_key: "alta-1" };
    const r1 = await postAlta({ request: req(plano, cuerpo) } as never);
    const j1 = (await r1.json()) as { tenant_id: string };
    const r2 = await postAlta({ request: req(plano, cuerpo) } as never);
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as { tenant_id: string }).tenant_id).toBe(j1.tenant_id);
    expect(control.tenants.size).toBe(1);
  });

  it("403 sin sesión y 422 con número inválido", async () => {
    const r403 = await postAlta({
      request: new Request("http://x/api/onboarding/alta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_comercio: "Kiosco X", rubro: "kiosco" }),
      }),
    } as never);
    expect(r403.status).toBe(403);
    const plano = sesionEnStore("dueno-2");
    const r422 = await postAlta({
      request: req(plano, { nombre_comercio: "Kiosco X", rubro: "kiosco", numero: "abc" }),
    } as never);
    expect(r422.status).toBe(422);
  });
});
