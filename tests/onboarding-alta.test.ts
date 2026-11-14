import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { calcular_checklist } from "../src/modules/onboarding/checklist.js";
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
  return ctx("http://x/api/onboarding/alta", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}`, ...headers },
    body: cuerpo as Record<string, unknown>,
  });
}

beforeEach(() => {
  resetStore();
});

describe("alta autoservicio ON1", () => {
  it("201 crea comercio activo con membership de dueño y código vincular", async () => {
    const plano = sesionEnStore("dueno-1");
    const r = await postAlta(
      req(plano, {
        nombre_comercio: "Kiosco La Esquina",
        rubro: "kiosco",
        numero: "11 5555-1234",
        opt_in: true,
      }),
    );
    expect(r.status).toBe(201);
    const j = (await r.json()) as { tenant_id: string; estado: string; vincular: { codigo: string } | null };
    expect(j.estado).toBe("activo");
    expect(j.vincular?.codigo).toMatch(/^\d{6}$/);
    const tenant = control.tenants.get(j.tenant_id);
    expect(tenant?.ownerGoogleSub).toBe("dueno-1");
    expect(tenant?.plan).toBe("demo");
    expect(tenant?.rubro).toBe("kiosco");
    const memb = [...control.memberships.values()].find((m) => m.tenantId === j.tenant_id);
    expect(memb?.rol).toBe("dueno");
  });

  it("doble envío devuelve 409 con el mismo tenant", async () => {
    const plano = sesionEnStore("dueno-1");
    const cuerpo = { nombre_comercio: "Kiosco La Esquina", rubro: "kiosco", request_key: "alta-1" };
    const r1 = await postAlta(req(plano, cuerpo));
    const j1 = (await r1.json()) as { tenant_id: string };
    const r2 = await postAlta(req(plano, cuerpo));
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as { tenant_id: string }).tenant_id).toBe(j1.tenant_id);
    expect(control.tenants.size).toBe(1);
  });

  it("403 sin sesión y 422 con número inválido", async () => {
    const r403 = await postAlta(
      ctx("http://x/api/onboarding/alta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { nombre_comercio: "Kiosco X", rubro: "kiosco" },
      }),
    );
    expect(r403.status).toBe(403);
    const plano = sesionEnStore("dueno-2");
    const r422 = await postAlta(req(plano, { nombre_comercio: "Kiosco X", rubro: "kiosco", numero: "abc" }));
    expect(r422.status).toBe(422);
  });

  it("verificar después: sin número crea igual sin vincular y la checklist lo pide primero (ON1.5)", async () => {
    const plano = sesionEnStore("dueno-tardio");
    const r = await postAlta(req(plano, { nombre_comercio: "Kiosco Tardío", rubro: "almacen" }));
    expect(r.status).toBe(201);
    const j = (await r.json()) as { tenant_id: string; vincular: null; estado: string };
    expect(j.vincular).toBeNull();
    expect(j.estado).toBe("activo");
    const checklist = calcular_checklist({
      productos: 0,
      productosConUmbral: 0,
      proveedores: 0,
      invitaciones: 0,
      whatsappVerificado: false,
    });
    expect(checklist.pasos[0]?.id).toBe("whatsapp");
  });
});
