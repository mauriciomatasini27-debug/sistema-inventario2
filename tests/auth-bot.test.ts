import { describe, expect, it, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion, sha256Hex } from "../src/modules/auth/sesiones.js";
import { debeInvalidarPorIntentos } from "../src/modules/whatsapp/vincular.js";
import {
  enmascararNumero,
  esPeticionSensibleBot,
  numeroOcupadoPorOtro,
  preguntaPorCosto,
  puedeRecibirAviso,
  puedeUsarBot,
  RESPUESTA_SENSIBLE_BOT,
  RESPUESTA_SIN_PERMISO_COSTO,
} from "../src/modules/auth/bot.js";
import { RESPUESTA_NO_VINCULADO } from "../src/modules/whatsapp/resolucion.js";
import { POST as postVincularCode } from "../src/pages/api/whatsapp/vincular-code.js";
import { POST as postDesvincular } from "../src/pages/api/whatsapp/desvincular.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { PATCH as patchMemberships } from "../src/pages/api/tenants/[id]/memberships.js";

process.env.WHATSAPP_APP_SECRET = "test-secret-bot";

let wamidN = 0;

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

function tenantConMiembros(id: string, dueno: string, empleado = "juan") {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco La Esquina",
    slug: "kiosco-la-esquina",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: false,
  });
  control.memberships.set(`m-${dueno}`, { id: `m-${dueno}`, tenantId: id, googleSub: dueno, rol: "dueno", permisos: [], estado: "activo", puedeUsarBot: true });
  control.memberships.set("m-juan", { id: "m-juan", tenantId: id, googleSub: empleado, rol: "empleado", permisos: [], estado: "activo", puedeUsarBot: true });
  control.users.set(empleado, { googleSub: empleado, email: "juan@gmail.com", emailVerificado: true });
}

function webhookBody(from: string, texto: string) {
  wamidN += 1;
  return JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ id: `wamid-bot-${wamidN}`, from, timestamp: String(Math.floor(Date.now() / 1000)), text: { body: texto } }] } }] }],
  });
}

async function postMensaje(from: string, texto: string) {
  const raw = webhookBody(from, texto);
  const firma = `sha256=${createHmac("sha256", "test-secret-bot").update(raw, "utf8").digest("hex")}`;
  return postWebhook(ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma }, body: raw }));
}

async function generarCodigo(sesionPlano: string, tenantId: string, numero: string) {
  const r = await postVincularCode(
    ctx("http://x/api/whatsapp/vincular-code", {
      method: "POST",
      headers: { cookie: `__Host-sesion=${sesionPlano}` },
      body: { tenant_id: tenantId, numero },
    }),
  );
  expect(r.status).toBe(201);
  return ((await r.json()) as { codigo: string }).codigo;
}

beforeEach(() => {
  resetStore();
});

describe("AU11 nucleo puro", () => {
  it("puedeUsarBot: dueno siempre, empleado según interruptor (default true)", () => {
    expect(puedeUsarBot({ rol: "dueno" })).toBe(true);
    expect(puedeUsarBot({ rol: "empleado" })).toBe(true);
    expect(puedeUsarBot({ rol: "empleado", puedeUsarBot: true })).toBe(true);
    expect(puedeUsarBot({ rol: "empleado", puedeUsarBot: false })).toBe(false);
  });

  it("un numero opera como un solo usuario (AU11.5)", () => {
    const vinculos = [{ numeroE164: "+5491155551234", googleSub: "a", estado: "verificado" }];
    expect(numeroOcupadoPorOtro({ vinculos, numero: "+5491155551234", googleSub: "b" })).toBe(true);
    expect(numeroOcupadoPorOtro({ vinculos, numero: "+5491155551234", googleSub: "a" })).toBe(false);
    expect(numeroOcupadoPorOtro({ vinculos: [{ numeroE164: "+5491155551234", googleSub: "b", estado: "revocado" }], numero: "+5491155551234", googleSub: "b" })).toBe(false);
  });

  it("distingue pregunta por costo de precio de venta", () => {
    expect(preguntaPorCosto("cuánto me cuesta el Milka")).toBe(true);
    expect(preguntaPorCosto("cuál es el costo del Milka")).toBe(true);
    expect(preguntaPorCosto("margen del Milka")).toBe(true);
    expect(preguntaPorCosto("precio del Milka")).toBe(false);
    expect(preguntaPorCosto("cuántos Milka tengo")).toBe(false);
  });

  it("detecta peticiones sensibles que van a la web", () => {
    expect(esPeticionSensibleBot("exportar historial")).toBe(true);
    expect(esPeticionSensibleBot("cambié el CBU")).toBe(true);
    expect(esPeticionSensibleBot("invitar a Pedro")).toBe(true);
    expect(esPeticionSensibleBot("cuántos Milka tengo")).toBe(false);
    expect(esPeticionSensibleBot("VINCULAR 123456")).toBe(false);
  });

  it("avisos sensibles solo al Dueno (AU11.9)", () => {
    expect(puedeRecibirAviso({ rol: "dueno", tipo: "resumen_cierre" })).toBe(true);
    expect(puedeRecibirAviso({ rol: "empleado", tipo: "resumen_cierre" })).toBe(false);
    expect(puedeRecibirAviso({ rol: "empleado", tipo: "aviso_facturas" })).toBe(false);
    expect(puedeRecibirAviso({ rol: "empleado", tipo: "alerta_stock" })).toBe(true);
    expect(enmascararNumero("+5491155551234")).not.toContain("55551234");
  });

  it("5 intentos fallidos invalidan el código", () => {
    expect(debeInvalidarPorIntentos(4)).toBe(false);
    expect(debeInvalidarPorIntentos(5)).toBe(true);
  });
});

describe("AU11 vincular por webhook", () => {
  it("flujo completo: código web + VINCULAR deja vínculo verificado", async () => {
    tenantConMiembros("t-1", "dueno-1");
    const d = sesion("dueno-1", "t-1");
    const numero = "11 5555-1234";
    const codigo = await generarCodigo(d.idPlano, "t-1", numero);
    const r = await postMensaje("5491155551234", `VINCULAR ${codigo}`);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { accion: string }).accion).toBe("vincular_ok");
    expect(control.botLinks.get("+5491155551234")?.estado).toBe("verificado");
  });

  it("código vencido, usado o de otro número falla sin vincular", async () => {
    tenantConMiembros("t-1", "dueno-1");
    const d = sesion("dueno-1", "t-1");
    const codigo = await generarCodigo(d.idPlano, "t-1", "11 5555-1234");
    // Otro número: sin pendiente para ese remitente, no revela nada.
    const r1 = await postMensaje("5491199999999", `VINCULAR ${codigo}`);
    expect(((await r1.json()) as { motivo: string }).motivo).toBe("codigo_invalido");
    // Vencido.
    const p = control.vincularCodes.get("+5491155551234")!;
    p.expiraEn = Date.now() - 1000;
    const r2 = await postMensaje("5491155551234", `VINCULAR ${codigo}`);
    expect(((await r2.json()) as { motivo: string }).motivo).toBe("vencido");
    expect(control.botLinks.get("+5491155551234")).toBeUndefined();
  });

  it("5 códigos errados invalidan; el correcto después ya no sirve", async () => {
    tenantConMiembros("t-1", "dueno-1");
    const d = sesion("dueno-1", "t-1");
    const codigo = await generarCodigo(d.idPlano, "t-1", "11 5555-1234");
    let motivo = "";
    for (let i = 0; i < 5; i++) {
      const r = await postMensaje("5491155551234", "VINCULAR 000000");
      motivo = ((await r.json()) as { motivo: string }).motivo;
    }
    expect(motivo).toBe("intentos_agotados");
    const rOk = await postMensaje("5491155551234", `VINCULAR ${codigo}`);
    expect(((await rOk.json()) as { accion: string }).accion).toBe("vincular_error");
    expect(control.botLinks.get("+5491155551234")).toBeUndefined();
  });

  it("número vinculado a otro usuario: 409 en la web", async () => {
    tenantConMiembros("t-1", "dueno-1");
    const d = sesion("dueno-1", "t-1");
    const j = sesion("juan", "t-1");
    const codigo = await generarCodigo(d.idPlano, "t-1", "11 5555-1234");
    await postMensaje("5491155551234", `VINCULAR ${codigo}`);
    const r = await postVincularCode(
      ctx("http://x/api/whatsapp/vincular-code", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${j.idPlano}` },
        body: { tenant_id: "t-1", numero: "11 5555-1234" },
      }),
    );
    expect(r.status).toBe(409);
  });

  it("empleado deshabilitado no puede generar código (AU11.3)", async () => {
    tenantConMiembros("t-1", "dueno-1");
    const d = sesion("dueno-1", "t-1");
    const j = sesion("juan", "t-1");
    const off = await patchMemberships(
      ctx("http://x/api/tenants/t-1/memberships", {
        method: "PATCH",
        headers: { cookie: `__Host-sesion=${d.idPlano}` },
        body: { google_sub: "juan", puede_usar_bot: false },
        params: { id: "t-1" },
      }),
    );
    expect(off.status).toBe(200);
    const r = await postVincularCode(
      ctx("http://x/api/whatsapp/vincular-code", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${j.idPlano}` },
        body: { tenant_id: "t-1", numero: "11 5555-9999" },
      }),
    );
    expect(r.status).toBe(403);
  });
});

describe("AU11 mensajes con identidad", () => {
  async function empleadoVinculado() {
    tenantConMiembros("t-1", "dueno-1");
    const j = sesion("juan", "t-1");
    const codigo = await generarCodigo(j.idPlano, "t-1", "11 5555-1234");
    await postMensaje("5491155551234", `VINCULAR ${codigo}`);
  }

  it("empleado pregunta costo: denegación explícita", async () => {
    await empleadoVinculado();
    const r = await postMensaje("5491155551234", "cuánto me cuesta el Milka");
    const j = (await r.json()) as { respuesta: string };
    expect(j.respuesta).toBe(RESPUESTA_SIN_PERMISO_COSTO);
  });

  it("revocado: el siguiente mensaje no recibe datos (AU11.6)", async () => {
    await empleadoVinculado();
    const m = control.memberships.get("m-juan")!;
    m.estado = "revocado";
    const r = await postMensaje("5491155551234", "cuántos Milka tengo");
    const j = (await r.json()) as { respuesta: string };
    expect(j.respuesta).toBe(RESPUESTA_NO_VINCULADO);
    expect(JSON.stringify(j)).not.toContain("Alfajor");
  });

  it("acción sensible por bot deriva a la web (AU11.7)", async () => {
    await empleadoVinculado();
    const r = await postMensaje("5491155551234", "exportar historial");
    const j = (await r.json()) as { respuesta: string; accion: string };
    expect(j.respuesta).toBe(RESPUESTA_SENSIBLE_BOT);
  });

  it("desvincular corta el acceso; revincular con código nuevo anda", async () => {
    await empleadoVinculado();
    const j = sesion("juan", "t-1");
    const r = await postDesvincular(
      ctx("http://x/api/whatsapp/desvincular", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${j.idPlano}` },
        body: { numero: "11 5555-1234" },
      }),
    );
    expect(r.status).toBe(200);
    const r2 = await postMensaje("5491155551234", "cuántos Milka tengo");
    expect(((await r2.json()) as { respuesta: string }).respuesta).toBe(RESPUESTA_NO_VINCULADO);
    // Celular nuevo: otro código y vuelve a operar.
    const codigo = await generarCodigo(j.idPlano, "t-1", "11 5555-9999");
    const r3 = await postMensaje("5491155559999", `VINCULAR ${codigo}`);
    expect(((await r3.json()) as { accion: string }).accion).toBe("vincular_ok");
    void sha256Hex;
  });
});
