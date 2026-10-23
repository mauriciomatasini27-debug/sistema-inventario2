import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { limpiarAlertasStockMemoria, registrarAlertasStock } from "../src/lib/repos/whatsapp.js";
import { GET } from "../src/pages/api/alertas/historial.js";

function sesion(sub: string, tenantId: string, rol: "dueno" | "empleado"): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash, googleSub: sub, tenantId,
    expiraAt: c.registro.expiraAt, expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(), reauthAt: ahora.toISOString(),
  });
  control.memberships.set(`m-${sub}`, { id: `m-${sub}`, tenantId, googleSub: sub, rol, permisos: [], estado: "activo" });
  return c.idPlano;
}

const pedir = (cookie?: string) =>
  GET(ctx("http://x/api/alertas/historial", cookie ? { headers: { cookie: `__Host-sesion=${cookie}` } } : {}));

beforeEach(() => {
  resetStore();
  limpiarAlertasStockMemoria();
  delete process.env.TENANT_DATABASE_URL;
});

describe("DASH-S6 historial de alertas", () => {
  it("sin sesión 401, Empleado 403", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir(sesion("emp", "t-1", "empleado"))).status).toBe(403);
  });

  it("Dueño ve una fila por alerta aunque el job reintente, solo de su comercio", async () => {
    const a = { sku: "yerba", nombre: "Yerba", stock: 2, umbral: 10, urgente: true };
    await registrarAlertasStock("t-1", "2026-10-22", [a]);
    await registrarAlertasStock("t-1", "2026-10-22", [a]);
    await registrarAlertasStock("t-1", "2026-10-23", [a, { ...a, sku: "azucar", nombre: "Azúcar", urgente: false, stock: 8 }]);
    await registrarAlertasStock("t-2", "2026-10-23", [{ ...a, sku: "ajeno" }]);
    const r = await pedir(sesion("duena", "t-1", "dueno"));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { alertas: { sku: string; fecha: string }[] };
    expect(j.alertas.map((x) => `${x.fecha}/${x.sku}`)).toEqual(["2026-10-23/azucar", "2026-10-23/yerba", "2026-10-22/yerba"]);
  });
});
