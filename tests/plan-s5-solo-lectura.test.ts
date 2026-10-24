import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { guardarModulosBot, leerModulosBot } from "../src/lib/repos/bot-modulos.js";
import { olvidarNivelBot, registrarTurnoBot } from "../src/lib/repos/bot-turnos.js";
import { GET as getHistorial } from "../src/pages/api/whatsapp/historial.js";
import { GET as getBotModulos, PATCH as patchBotModulos } from "../src/pages/api/bot-modulos.js";

function sesion(sub: string, tenantId: string): string {
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

function tenantConDueno(id: string, dueno: string): void {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "demo",
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: true,
  });
  control.memberships.set(`m-${dueno}`, {
    id: `m-${dueno}`,
    tenantId: id,
    googleSub: dueno,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
}

beforeEach(() => {
  resetStore();
  olvidarPlanesEnMemoria();
  olvidarNivelBot();
  delete process.env.TENANT_DATABASE_URL;
});

describe("PLAN-S5 historial y módulos en solo lectura tras bajar de plan", () => {
  it("Plus → Básico congela historial y toggles; Plus dentro de 90 días restaura módulos", async () => {
    const tenantId = "t-s5";
    tenantConDueno(tenantId, "dueno-s5");
    await crearProveedorCobro().crearSuscripcion({ tenantId, planId: "plus" });
    await guardarModulosBot(tenantId, ["rotacion", "vencimientos"]);

    const turnoPlus = await registrarTurnoBot({
      tenantId,
      wamid: "w1",
      numeroE164: "+5491100000001",
      googleSub: "dueno-s5",
      pregunta: "stock",
      respuesta: "ok",
      fuente: "memoria",
      ahoraMs: Date.now(),
    });
    expect(turnoPlus).toEqual({ tipo: "sin-base" });

    await crearProveedorCobro().crearSuscripcion({ tenantId, planId: "basico" });
    const turnoBasico = await registrarTurnoBot({
      tenantId,
      wamid: "w2",
      numeroE164: "+5491100000001",
      googleSub: "dueno-s5",
      pregunta: "otra",
      respuesta: "no",
      fuente: "memoria",
      ahoraMs: Date.now(),
    });
    expect(turnoBasico).toEqual({ tipo: "solo-lectura" });

    const cookie = sesion("dueno-s5", tenantId);
    const rHist = await getHistorial(
      ctx("http://x/api/whatsapp/historial", { headers: { cookie: `__Host-sesion=${cookie}` } }),
    );
    expect(rHist.status).toBe(200);
    const jHist = (await rHist.json()) as {
      soloLectura: boolean;
      aviso: string;
      filas: unknown[];
    };
    expect(jHist.soloLectura).toBe(true);
    expect(jHist.aviso.toLowerCase()).toContain("solo lectura");
    expect(Array.isArray(jHist.filas)).toBe(true);

    const rPatch = await patchBotModulos(
      ctx("http://x/api/bot-modulos", {
        method: "PATCH",
        headers: { cookie: `__Host-sesion=${cookie}` },
        body: { modulo: "rotacion", activo: false },
      }),
    );
    expect(rPatch.status).toBe(409);
    expect(((await rPatch.json()) as { codigo?: string }).codigo).toBe("solo_lectura");
    expect(await leerModulosBot(tenantId)).toEqual(["rotacion", "vencimientos"]);

    await crearProveedorCobro().crearSuscripcion({ tenantId, planId: "plus" });
    expect(await leerModulosBot(tenantId)).toEqual(["rotacion", "vencimientos"]);
    const rGet = await getBotModulos(
      ctx("http://x/api/bot-modulos", { headers: { cookie: `__Host-sesion=${cookie}` } }),
    );
    expect(rGet.status).toBe(200);
    expect(((await rGet.json()) as { activos: string[] }).activos).toEqual(["rotacion", "vencimientos"]);
  });

  it("pasados 90 días congelados, volver a Plus borra los toggles guardados", async () => {
    vi.useFakeTimers();
    const base = new Date("2026-01-01T12:00:00Z");
    vi.setSystemTime(base);

    const tenantId = "t-s5-90";
    tenantConDueno(tenantId, "dueno-90");
    await crearProveedorCobro().crearSuscripcion({ tenantId, planId: "plus" });
    await guardarModulosBot(tenantId, ["rotacion", "vencimientos"]);
    await registrarTurnoBot({
      tenantId,
      wamid: "w90",
      numeroE164: "+5491100000090",
      googleSub: "dueno-90",
      pregunta: "x",
      respuesta: "y",
      fuente: "memoria",
      ahoraMs: base.getTime(),
    });

    await crearProveedorCobro().crearSuscripcion({ tenantId, planId: "basico" });
    await registrarTurnoBot({
      tenantId,
      wamid: "w91",
      numeroE164: "+5491100000090",
      googleSub: "dueno-90",
      pregunta: "z",
      respuesta: "w",
      fuente: "memoria",
      ahoraMs: base.getTime(),
    });

    vi.advanceTimersByTime(91 * 86_400_000);
    await crearProveedorCobro().crearSuscripcion({ tenantId, planId: "plus" });

    const cookie = sesion("dueno-90", tenantId);
    await getBotModulos(ctx("http://x/api/bot-modulos", { headers: { cookie: `__Host-sesion=${cookie}` } }));
    expect(await leerModulosBot(tenantId)).toEqual([]);

    vi.useRealTimers();
  });
});

afterEach(() => {
  vi.useRealTimers();
});
