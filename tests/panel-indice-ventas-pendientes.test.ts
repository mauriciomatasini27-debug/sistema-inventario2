import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { empujarOperacion } from "../src/lib/repos/sync.js";
import { GET as getIndice } from "../src/pages/api/panel/indice.js";

const AHORA = new Date("2026-10-20T12:00:00.000Z");

type CuerpoIndice = {
  modulos: Array<{ id: string }>;
  upsell: unknown[];
  rol: string;
  ventas_pendientes?: number;
};

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

function sesion(sub: string, tenantId: string | null): string {
  const c = crearSesion({ googleSub: sub, tenantId, ahora: AHORA });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: AHORA.toISOString(),
  });
  return c.idPlano;
}

function comercio() {
  control.tenants.set("t-1", {
    id: "t-1",
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "g-1",
    esDemo: false,
  });
  control.memberships.set("m-1", {
    id: "m-1",
    tenantId: "t-1",
    googleSub: "g-1",
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  control.memberships.set("m-3", {
    id: "m-3",
    tenantId: "t-1",
    googleSub: "g-3",
    rol: "empleado",
    permisos: [],
    estado: "activo",
  });
}

function pushVentaNoAplicable(opId: string, seq: number) {
  return empujarOperacion({
    opId,
    deviceCode: "caja-01",
    deviceSeq: seq,
    hlc: `${Date.now()}:${seq}`,
    modulo: "sales",
    payload: {
      lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
      medio: "Efectivo",
      device_code: "caja-01",
      seq_local: seq,
      client_occurred_at: new Date().toISOString(),
      pagos: [{ medio: "Efectivo", monto_centavos: 100 }],
    },
  });
}

async function indice(plano: string): Promise<CuerpoIndice> {
  const r = await getIndice(
    ctx("http://x/api/panel/indice", { headers: { cookie: `__Host-sesion=${plano}` } }),
  );
  return (await r.json()) as CuerpoIndice;
}

beforeEach(() => {
  // P10-20: la sesión del fixture vence a los 30 días de AHORA; con el reloj
  // real el test se rompía solo al día 30. Fijar solo Date deja vivos los timers.
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
});

afterEach(() => {
  vi.useRealTimers();
  singleSinDb();
});

describe("GET /api/panel/indice cuenta las ventas pendientes para el Dueño", () => {
  it("arranca en 0 y suma una venta no aplicable", async () => {
    comercio();
    const plano = sesion("g-1", "t-1");
    expect((await indice(plano)).ventas_pendientes).toBe(0);

    const r = await pushVentaNoAplicable(crypto.randomUUID(), 1);
    expect(r.cuerpo["venta"]).toBe("no_aplicable");

    expect((await indice(plano)).ventas_pendientes).toBe(1);
  });

  it("el empleado nunca recibe el campo", async () => {
    comercio();
    await pushVentaNoAplicable(crypto.randomUUID(), 1);
    const body = await indice(sesion("g-3", "t-1"));
    expect(body.rol).toBe("empleado");
    expect(body).not.toHaveProperty("ventas_pendientes");
  });
});
