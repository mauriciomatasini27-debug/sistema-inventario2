import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as postMovements } from "../src/pages/api/cash/movements.js";

// P10-27: la ruta de movimientos de caja resuelve sesión + membership y
// autoriza antes de llamar al repo; el body no define el rol.

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function tenantConMiembro(tenantId: string, sub: string, rol: "dueno" | "empleado") {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco P10-27",
    slug: "kiosco-p10-27",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueno-1",
    esDemo: false,
  });
  const mid = `m-${tenantId}-${sub}`;
  control.memberships.set(mid, { id: mid, tenantId, googleSub: sub, rol, permisos: [], estado: "activo" });
}

function sesionDe(sub: string, tenantId: string | null): string {
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

function movimiento(over: Record<string, unknown> = {}) {
  return {
    tipo: "egreso",
    metodo: "Efectivo",
    categoria_id: "sueldo_mensual",
    origen: "sueldo",
    monto_centavos: 1000,
    device_code: "caja-01",
    seq_local: 1,
    client_occurred_at: new Date().toISOString(),
    ...over,
  };
}

function req(plano: string | undefined, body: Record<string, unknown>) {
  return ctx("http://x/api/cash/movements", {
    method: "POST",
    body,
    headers: {
      "Idempotency-Key": `p10-27-${crypto.randomUUID()}`,
      ...(plano === undefined ? {} : { cookie: `__Host-sesion=${plano}` }),
    },
  });
}

beforeEach(() => {
  modoSingleSinDb();
  resetStore();
});

describe("P10-27 POST /api/cash/movements: auth de sesión + membership", () => {
  it("empleado con sesión no registra sueldo: 403 de la ruta, no el 403 del núcleo", async () => {
    tenantConMiembro("t-p10-27", "emp-1", "empleado");
    const plano = sesionDe("emp-1", "t-p10-27");
    const r = (await postMovements(
      req(plano, movimiento({ rol: "dueno", actor: "emp-1" })),
    )) as Response;
    expect(r.status).toBe(403);
    const json = (await r.json()) as { error: string };
    expect(json.error).toBe("No tenés permiso para este movimiento.");
    expect(store.movements).toHaveLength(0);
  });

  it("sesión sin membership activa recibe 403 aunque el movimiento no sea sensible", async () => {
    tenantConMiembro("t-p10-27", "dueno-1", "dueno");
    const plano = sesionDe("visitante", "t-p10-27");
    const r = (await postMovements(
      req(plano, movimiento({ origen: "retiro", categoria_id: "caja_chica" })),
    )) as Response;
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe("No tenés permiso en este comercio.");
    expect(store.movements).toHaveLength(0);
  });

  it("dueño con sesión registra sueldo y queda el actor de la sesión", async () => {
    tenantConMiembro("t-p10-27", "dueno-1", "dueno");
    const plano = sesionDe("dueno-1", "t-p10-27");
    const r = (await postMovements(
      req(plano, movimiento({ rol: "empleado", actor: "forjado" })),
    )) as Response;
    expect(r.status).toBe(201);
    expect(store.movements).toHaveLength(1);
    expect(store.movements[0]?.actor).toBe("dueno-1");
  });

  it("legado sin sesión mantiene el default dueño", async () => {
    const r = (await postMovements(req(undefined, movimiento()))) as Response;
    expect(r.status).toBe(201);
    expect(store.movements[0]?.actor).toBe("legado");
  });
});
