import { describe, expect, it, beforeEach } from "vitest";
import {
  armarTextoAlertaSeguridad,
  decidirAlertaSeguridad,
  esEventoAlertaSeguridad,
} from "../src/modules/auth/bot.js";
import {
  ejecutar_alertas_seguridad_wa,
  limpiar_corridas_seguridad,
} from "../src/jobs/whatsapp-alertas-seguridad.js";
import {
  armarEmailSeguridad,
  debeProbarEmail,
  elegirCanal,
} from "../src/modules/auth/segundo-canal.js";

beforeEach(() => {
  limpiar_corridas_seguridad();
});

describe("P1-1 alertas WA seguridad núcleo", () => {
  it("solo tipos de seguridad avisan", () => {
    expect(esEventoAlertaSeguridad("login_nuevo")).toBe(true);
    expect(esEventoAlertaSeguridad("sesion_cerrada_remota")).toBe(true);
    expect(esEventoAlertaSeguridad("reauth_fallida")).toBe(true);
    expect(esEventoAlertaSeguridad("vinculo_ok")).toBe(true);
    expect(esEventoAlertaSeguridad("alerta_stock")).toBe(false);
    expect(esEventoAlertaSeguridad("login")).toBe(false);
  });

  it("sin vínculo no envía; deshabilitado no envía", () => {
    expect(
      decidirAlertaSeguridad({ evento: "login_nuevo", rolDestino: "dueno", vinculado: false }).enviar,
    ).toBe(false);
    expect(
      decidirAlertaSeguridad({ evento: "login_nuevo", rolDestino: "empleado", vinculado: true, puedeUsarBot: false }).enviar,
    ).toBe(false);
    expect(
      decidirAlertaSeguridad({ evento: "login_nuevo", rolDestino: "dueno", vinculado: true }).enviar,
    ).toBe(true);
  });

  it("textos sin datos sensibles crudos", () => {
    const t = armarTextoAlertaSeguridad({ evento: "login_nuevo", comercio: "Kiosco", detalle: "Chrome en Android" });
    expect(t).toContain("Kiosco");
    expect(t).not.toMatch(/token|session_id|password|secret/i);
  });
});

describe("P1-1 job alertas seguridad", () => {
  it("envía una vez por evento (idempotente)", () => {
    const enviados: string[] = [];
    const base = {
      eventId: "e1",
      tipo: "login_nuevo",
      tenantId: "t1",
      googleSubDestino: "dueno-1",
      rolDestino: "dueno" as const,
      vinculado: true,
      comercio: "Kiosco",
      destinoWa: "+5491100000001",
    };
    const r1 = ejecutar_alertas_seguridad_wa({
      eventos: [base],
      enviar: ({ idempotencyKey }) => {
        enviados.push(idempotencyKey);
        return { ok: true };
      },
    });
    expect(r1.resultados[0]?.estado).toBe("enviado");
    const r2 = ejecutar_alertas_seguridad_wa({
      eventos: [base],
      enviar: () => ({ ok: true }),
    });
    expect(r2.resultados[0]?.estado).toBe("omitido_ya_enviado");
    expect(enviados).toHaveLength(1);
  });

  it("fallo de canal no lanza y queda como fallo", () => {
    const r = ejecutar_alertas_seguridad_wa({
      eventos: [
        {
          eventId: "e2",
          tipo: "reauth_fallida",
          tenantId: "t1",
          googleSubDestino: "dueno-1",
          rolDestino: "dueno",
          vinculado: true,
          comercio: "Kiosco",
          destinoWa: "+5491100000001",
        },
      ],
      enviar: () => ({ ok: false, error: "red" }),
    });
    expect(r.resultados[0]?.estado).toBe("fallo");
  });

  it("no-alerta y no-vinculado se omiten sin enviar", () => {
    let n = 0;
    const r = ejecutar_alertas_seguridad_wa({
      eventos: [
        { eventId: "a", tipo: "login", tenantId: "t1", googleSubDestino: "x", rolDestino: "dueno", vinculado: true, comercio: "K", destinoWa: "+1" },
        { eventId: "b", tipo: "login_nuevo", tenantId: "t1", googleSubDestino: "x", rolDestino: "dueno", vinculado: false, comercio: "K", destinoWa: "+1" },
      ],
      enviar: () => {
        n += 1;
        return { ok: true };
      },
    });
    expect(r.resultados.map((x) => x.estado)).toEqual(["omitido_no_alerta", "omitido_no_vinculado"]);
    expect(n).toBe(0);
  });
});

describe("P1-2 segundo canal fallback", () => {
  it("elegirCanal prefiere WA y cae a email", () => {
    expect(elegirCanal({ vinculadoWA: true, waHabilitado: true, emailVerificado: true })).toBe("wa");
    expect(elegirCanal({ vinculadoWA: false, waHabilitado: false, emailVerificado: true })).toBe("email");
    expect(elegirCanal({ vinculadoWA: false, waHabilitado: false, emailVerificado: false })).toBe("ninguno");
    expect(debeProbarEmail("fallo")).toBe(true);
    expect(debeProbarEmail("omitido_no_vinculado")).toBe(true);
    expect(debeProbarEmail("enviado")).toBe(false);
  });

  it("email sin sensibles crudos", () => {
    const m = armarEmailSeguridad({ evento: "login_nuevo", comercio: "Kiosco", detalle: "Chrome" });
    expect(m.asunto).toContain("Kiosco");
    expect(m.texto).not.toMatch(/token|session_id|password|secret/i);
  });

  it("WA fallido cae a email una vez", () => {
    const mails: string[] = [];
    const r = ejecutar_alertas_seguridad_wa({
      eventos: [
        {
          eventId: "f1",
          tipo: "login_nuevo",
          tenantId: "t1",
          googleSubDestino: "d1",
          rolDestino: "dueno",
          vinculado: true,
          comercio: "Kiosco",
          destinoWa: "+5491100000001",
          emailDestino: "d@x.com",
          emailVerificado: true,
        },
      ],
      enviar: () => ({ ok: false, error: "red" }),
      enviarEmail: ({ idempotencyKey }) => {
        mails.push(idempotencyKey);
        return { ok: true };
      },
    });
    expect(r.resultados[0]?.estado).toBe("enviado_email");
    const r2 = ejecutar_alertas_seguridad_wa({
      eventos: [
        {
          eventId: "f1",
          tipo: "login_nuevo",
          tenantId: "t1",
          googleSubDestino: "d1",
          rolDestino: "dueno",
          vinculado: false,
          comercio: "Kiosco",
          destinoWa: "+5491100000001",
          emailDestino: "d@x.com",
          emailVerificado: true,
        },
      ],
      enviar: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    });
    expect(r2.resultados[0]?.estado).toBe("omitido_ya_enviado");
    expect(mails).toHaveLength(1);
  });

  it("sin email verificado no hay fallback", () => {
    const r = ejecutar_alertas_seguridad_wa({
      eventos: [
        {
          eventId: "f2",
          tipo: "login_nuevo",
          tenantId: "t1",
          googleSubDestino: "d1",
          rolDestino: "dueno",
          vinculado: false,
          comercio: "K",
          destinoWa: "+1",
        },
      ],
      enviar: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    });
    expect(r.resultados[0]?.estado).toBe("omitido_no_vinculado");
  });
});
