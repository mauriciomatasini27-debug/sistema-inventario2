import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { canalAlerta, limpiarAlertasStockMemoria, registrarAlertasStock } from "../src/lib/repos/whatsapp.js";
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

  it("membership revocada en el comercio de la sesión da 403", async () => {
    const cookie = sesion("revocado", "t-1", "dueno");
    control.memberships.get("m-revocado")!.estado = "revocado";
    expect((await pedir(cookie)).status).toBe(403);
  });

  it("dueño de otro comercio con sesión de t-1 da 403", async () => {
    const cookie = sesion("ajeno", "t-1", "dueno");
    control.memberships.set("m-ajeno", {
      id: "m-ajeno", tenantId: "t-2", googleSub: "ajeno", rol: "dueno", permisos: [], estado: "activo",
    });
    expect((await pedir(cookie)).status).toBe(403);
  });

  it("ordena por fecha descendente y sku ascendente dentro del día", async () => {
    await registrarAlertasStock("t-1", "2026-10-21", [
      { sku: "zeta", nombre: "Zeta", stock: 1, umbral: 5, urgente: true },
      { sku: "alfa", nombre: "Alfa", stock: 2, umbral: 5, urgente: false },
    ]);
    await registrarAlertasStock("t-1", "2026-10-23", [
      { sku: "beta", nombre: "Beta", stock: 3, umbral: 5, urgente: true },
      { sku: "alfa", nombre: "Alfa", stock: 4, umbral: 5, urgente: false },
    ]);
    await registrarAlertasStock("t-1", "2026-10-22", [
      { sku: "omega", nombre: "Omega", stock: 5, umbral: 5, urgente: true },
    ]);
    const r = await pedir(sesion("orden", "t-1", "dueno"));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { alertas: { sku: string; fecha: string }[] };
    expect(j.alertas.map((x) => `${x.fecha}/${x.sku}`)).toEqual([
      "2026-10-23/alfa",
      "2026-10-23/beta",
      "2026-10-22/omega",
      "2026-10-21/alfa",
      "2026-10-21/zeta",
    ]);
  });

  it("sin alertas responde 200 con alertas vacías", async () => {
    const r = await pedir(sesion("vacio", "t-1", "dueno"));
    expect(r.status).toBe(200);
    expect((await r.json()) as { alertas: unknown[] }).toEqual({ alertas: [] });
  });

  it("las filas exponen canal y estado, y no la clave interna", async () => {
    await registrarAlertasStock("t-1", "2026-10-23", [
      { sku: "yerba", nombre: "Yerba", stock: 2, umbral: 10, urgente: true },
    ]);
    const r = await pedir(sesion("claves", "t-1", "dueno"));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { alertas: Record<string, unknown>[] };
    expect(j.alertas).toHaveLength(1);
    expect(Object.keys(j.alertas[0]!).sort()).toEqual([
      "canal",
      "estado",
      "fecha",
      "nombre",
      "sku",
      "stock",
      "umbral",
      "urgente",
    ]);
    expect(j.alertas[0]).toMatchObject({ canal: "whatsapp", estado: "enviado" });
    expect(j.alertas[0]).not.toHaveProperty("clave");
    expect(j.alertas[0]).not.toHaveProperty("registradaAt");
  });

  it("un canal email se conserva y un valor desconocido queda en whatsapp", async () => {
    expect(canalAlerta(undefined)).toBe("whatsapp");
    expect(canalAlerta("otro")).toBe("whatsapp");
    await registrarAlertasStock("t-1", "2026-10-23", [
      { sku: "yerba", nombre: "Yerba", stock: 2, umbral: 10, urgente: true, canal: "email" },
    ]);
    const r = await pedir(sesion("canal", "t-1", "dueno"));
    const j = (await r.json()) as { alertas: { canal: string; estado: string }[] };
    expect(j.alertas[0]).toMatchObject({ canal: "email", estado: "enviado" });
  });

  it("responde con Cache-Control no-store", async () => {
    const r = await pedir(sesion("cache", "t-1", "dueno"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});
