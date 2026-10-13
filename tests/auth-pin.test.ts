import { describe, expect, it, beforeEach } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import {
  estaBloqueadoPin,
  hashearPin,
  registrarFalloPin,
  validarPin,
  verificarPin,
} from "../src/modules/auth/pin.js";
import { POST as postPin } from "../src/pages/api/devices/pin.js";
import { POST as postBloquear } from "../src/pages/api/devices/bloquear.js";
import { POST as postDesbloquear } from "../src/pages/api/devices/desbloquear.js";

function sesion(sub: string, tenantId: string | null) {
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
  return c;
}

function tenantDueno(id: string, dueno: string) {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: false,
  });
  control.memberships.set("m-d", { id: "m-d", tenantId: id, googleSub: dueno, rol: "dueno", permisos: [], estado: "activo", puedeUsarBot: true });
  control.users.set(dueno, { googleSub: dueno, email: "d@x.com", emailVerificado: true });
}

function req(plano: string | null, body: unknown) {
  return new Request("http://x/api/devices/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(plano ? { cookie: `__Host-sesion=${plano}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetStore();
});

describe("P1-3 PIN núcleo", () => {
  it("formato 4-6 dígitos", () => {
    expect(validarPin("1234")).toBe(true);
    expect(validarPin("123456")).toBe(true);
    expect(validarPin("123")).toBe(false);
    expect(validarPin("1234567")).toBe(false);
    expect(validarPin("12a4")).toBe(false);
  });

  it("hash verifica y no expone el plano", () => {
    const h = hashearPin("1234");
    expect(h).not.toContain("1234");
    expect(verificarPin("1234", h)).toBe(true);
    expect(verificarPin("4321", h)).toBe(false);
    expect(verificarPin("1234", "basura")).toBe(false);
  });

  it("5 fallos bloquean 5 min", () => {
    let e = undefined as { fallos: number; bloqueadoHastaMs: number } | undefined;
    const ahora = 1_000_000;
    for (let i = 0; i < 4; i++) {
      e = registrarFalloPin(e, ahora);
      expect(estaBloqueadoPin(e, ahora)).toBe(false);
    }
    e = registrarFalloPin(e, ahora);
    expect(estaBloqueadoPin(e, ahora)).toBe(true);
    expect(estaBloqueadoPin(e, ahora + 5 * 60_000 + 1)).toBe(false);
  });
});

describe("P1-3 PIN rutas", () => {
  it("definir exige dueño: empleado 403, dueño 200 y audita sin plano", async () => {
    tenantDueno("t1", "dueno-1");
    control.memberships.set("m-e", { id: "m-e", tenantId: "t1", googleSub: "emp", rol: "empleado", permisos: [], estado: "activo", puedeUsarBot: true });
    const e = sesion("emp", "t1");
    const r1 = await postPin({ request: req(e.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }) } as never);
    expect(r1.status).toBe(403);
    const d = sesion("dueno-1", "t1");
    const r2 = await postPin({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "12" }) } as never);
    expect(r2.status).toBe(422);
    const r3 = await postPin({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }) } as never);
    expect(r3.status).toBe(200);
    expect(control.devicePins.get("PC1")?.pinHash).not.toContain("1234");
    const ev = control.events.find((x) => x.tipo === "pin_definido");
    expect(ev).toBeTruthy();
    expect(JSON.stringify(ev)).not.toContain("1234");
  });

  it("bloquear sin PIN 409; bloquear/desbloquear con PIN", async () => {
    tenantDueno("t1", "dueno-1");
    const d = sesion("dueno-1", "t1");
    const rb0 = await postBloquear({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1" }) } as never);
    expect(rb0.status).toBe(409);
    await postPin({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }) } as never);
    const rb = await postBloquear({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1" }) } as never);
    expect(rb.status).toBe(200);
    expect(control.deviceLocks.get("PC1")?.bloqueado).toBe(true);
    const rm = await postDesbloquear({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "0000" }) } as never);
    expect(rm.status).toBe(403);
    expect(control.events.some((x) => x.tipo === "pin_fallido")).toBe(true);
    const rok = await postDesbloquear({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }) } as never);
    expect(rok.status).toBe(200);
    expect(control.deviceLocks.get("PC1")?.bloqueado).toBe(false);
  });

  it("5 PIN errados bloquean con 429", async () => {
    tenantDueno("t1", "dueno-1");
    const d = sesion("dueno-1", "t1");
    await postPin({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }) } as never);
    let status = 0;
    for (let i = 0; i < 5; i++) {
      const r = await postDesbloquear({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "0000" }) } as never);
      status = r.status;
    }
    expect(status).toBe(403);
    const r6 = await postDesbloquear({ request: req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "0000" }) } as never);
    expect(r6.status).toBe(429);
  });
});
