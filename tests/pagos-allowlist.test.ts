import { describe, expect, it } from "vitest";
import { dominio_permitido, OFFICIAL_PAYMENT_DOMAINS } from "../src/modules/payments/beneficiarios.js";

// LANE G — allowlist cerrada (OP8.5/7.3): solo dominios oficiales conocidos.
// Nada de acortadores, nada de dominios parecidos, https siempre.
describe("lane G allowlist de dominios oficiales", () => {
  it("la lista es cerrada y solo trae dominios oficiales conocidos", () => {
    expect(OFFICIAL_PAYMENT_DOMAINS).toContain("mercadopago.com.ar");
    expect(OFFICIAL_PAYMENT_DOMAINS).not.toContain("bit.ly");
    for (const d of OFFICIAL_PAYMENT_DOMAINS) {
      expect(d).not.toMatch(/^https?:\/\//);
      expect(d).toBe(d.toLowerCase());
    }
  });

  it("acepta dominios oficiales y subdominios", () => {
    expect(dominio_permitido("https://www.mercadopago.com.ar/checkout/abc")).toBe(true);
    expect(dominio_permitido("https://mercadopago.com/abc")).toBe(true);
    expect(dominio_permitido("https://pagos.mercadopago.com.ar/x")).toBe(true);
    expect(dominio_permitido("https://www.arca.gob.ar/")).toBe(true);
    expect(dominio_permitido("https://www.afip.gob.ar/")).toBe(true);
    expect(dominio_permitido("https://WWW.MERCADOPAGO.COM.AR/x")).toBe(true);
  });

  it("rechaza http, credenciales embebidas y texto que no es URL", () => {
    expect(dominio_permitido("http://www.mercadopago.com.ar/")).toBe(false);
    expect(dominio_permitido("https://user:pass@mercadopago.com.ar/")).toBe(false);
    expect(dominio_permitido("https://user@mercadopago.com.ar/")).toBe(false);
    expect(dominio_permitido("no-es-una-url")).toBe(false);
    expect(dominio_permitido("")).toBe(false);
  });

  it("rechaza acortadores y dominios parecidos (phishing)", () => {
    expect(dominio_permitido("https://bit.ly/paga-aqui")).toBe(false);
    expect(dominio_permitido("https://mercadopago.com.ar.evil.com/pagar")).toBe(false);
    expect(dominio_permitido("https://evil-mercadopago.com.ar/pagar")).toBe(false);
    expect(dominio_permitido("https://mercadopag0.com.ar/pagar")).toBe(false);
    expect(dominio_permitido("https://arca-gob-ar.com/pagar")).toBe(false);
    expect(dominio_permitido("https://mercadopago.com.uy/pagar")).toBe(false);
  });
});
