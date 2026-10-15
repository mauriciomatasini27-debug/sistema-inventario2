import { describe, expect, it, beforeEach } from "vitest";
import { scryptSync } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
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
  return ctx("http://x/api/devices/x", {
    method: "POST",
    body: body as Record<string, unknown>,
    headers: { ...(plano ? { cookie: `__Host-sesion=${plano}` } : {}) },
  });
}

// El hash es `scrypt$<saltHex>$<hashHex>`: la sal y el hex son aleatorios y
// cualquier ventana de 4 hex puede ser "1234" por azar (~1/1000 por corrida).
// Por eso el "PIN no expuesto" se verifica con comparaciones exactas
// (formato, campos `$`, verificarPin), nunca con substring sobre el hash.
function verificarHashSinPlano(hash: string, plano: string): void {
  expect(hash).not.toBe(plano);
  const partes = hash.split("$");
  expect(partes[0]).toBe("scrypt");
  expect(partes).toHaveLength(3);
  expect(partes).not.toContain(plano);
  expect(verificarPin(plano, hash)).toBe(true);
}

// El evento auditado no debe llevar el plano: sin campo `pin` y sin ningún
// valor estrictamente igual al plano (recorrido exacto, no substring, porque
// ids/hashes/timestamps aleatorios pueden contener "1234" por azar).
function rutasConPlano(valor: unknown, plano: string, ruta = "$"): string[] {
  if (typeof valor === "string") return valor === plano ? [ruta] : [];
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => rutasConPlano(v, plano, `${ruta}[${i}]`));
  }
  if (valor !== null && typeof valor === "object") {
    return Object.entries(valor as Record<string, unknown>).flatMap(([k, v]) =>
      k === "pin" ? [`${ruta}.${k}`] : rutasConPlano(v, plano, `${ruta}.${k}`),
    );
  }
  return [];
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
    // El plano no es el hash ni un campo $-separado; la sal/hex puede
    // contener "1234" por azar (flake en CI).
    expect(h).not.toBe("1234");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h.split("$")).not.toContain("1234");
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
    const r1 = await postPin(req(e.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }));
    expect(r1.status).toBe(403);
    const d = sesion("dueno-1", "t1");
    const r2 = await postPin(req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "12" }));
    expect(r2.status).toBe(422);
    const r3 = await postPin(req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }));
    expect(r3.status).toBe(200);
    const guardado = control.devicePins.get("PC1")?.pinHash;
    expect(guardado).toBeTruthy();
    verificarHashSinPlano(guardado as string, "1234");
    expect(verificarPin("0000", guardado as string)).toBe(false);
    const ev = control.events.find((x) => x.tipo === "pin_definido");
    expect(ev).toBeTruthy();
    expect(rutasConPlano(ev, "1234")).toEqual([]);
  });

  it("aserciones exactas pasan aunque el hex contenga 1234 (determinista)", () => {
    // Fixture con "1234" garantizado en la sal: la aserción vieja por
    // substring (`not.toContain("1234")`) fallaría acá (red); las exactas pasan.
    const sal = "12341234123412341234123412341234";
    const fragil = `scrypt$${sal}$${scryptSync("1234", sal, 32).toString("hex")}`;
    expect(fragil).toContain("1234");
    verificarHashSinPlano(fragil, "1234");
    // Evento con un id aleatorio que contiene "1234": el substring sobre el
    // JSON fallaría; el recorrido exacto pasa (ningún valor === "1234").
    const evFragil = { tipo: "pin_definido", id: "evt-1234abcd", detalle: { device_code: "PC1" } };
    expect(JSON.stringify(evFragil)).toContain("1234");
    expect(rutasConPlano(evFragil, "1234")).toEqual([]);
  });

  it("bloquear sin PIN 409; bloquear/desbloquear con PIN", async () => {
    tenantDueno("t1", "dueno-1");
    const d = sesion("dueno-1", "t1");
    const rb0 = await postBloquear(req(d.idPlano, { tenant_id: "t1", device_code: "PC1" }));
    expect(rb0.status).toBe(409);
    await postPin(req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }));
    const rb = await postBloquear(req(d.idPlano, { tenant_id: "t1", device_code: "PC1" }));
    expect(rb.status).toBe(200);
    expect(control.deviceLocks.get("PC1")?.bloqueado).toBe(true);
    const rm = await postDesbloquear(req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "0000" }));
    expect(rm.status).toBe(403);
    expect(control.events.some((x) => x.tipo === "pin_fallido")).toBe(true);
    const rok = await postDesbloquear(req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }));
    expect(rok.status).toBe(200);
    expect(control.deviceLocks.get("PC1")?.bloqueado).toBe(false);
  });

  it("5 PIN errados bloquean con 429", async () => {
    tenantDueno("t1", "dueno-1");
    const d = sesion("dueno-1", "t1");
    await postPin(req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "1234" }));
    let status = 0;
    for (let i = 0; i < 5; i++) {
      const r = await postDesbloquear(req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "0000" }));
      status = r.status;
    }
    expect(status).toBe(403);
    const r6 = await postDesbloquear(req(d.idPlano, { tenant_id: "t1", device_code: "PC1", pin: "0000" }));
    expect(r6.status).toBe(429);
  });
});
