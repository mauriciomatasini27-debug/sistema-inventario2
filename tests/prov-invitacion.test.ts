import { describe, expect, it } from "vitest";
import {
  contacto_por_numero,
  parsear_invitar,
  puede_mandar,
  verificar_invitacion,
  type ContactoProveedor,
  type InvitacionProveedor,
} from "../src/modules/whatsapp/proveedor.js";

const INVITACION: InvitacionProveedor = {
  tenantId: "t-1",
  supplierCuit: null,
  codigoHash: "h-ok",
  expiraEn: 1_000,
  usado: false,
};

describe("PROV-S1/S2/S3 parsear_invitar", () => {
  it("lee PROV + 6 dígitos con espacios alrededor", () => {
    expect(parsear_invitar("PROV 123456")).toBe("123456");
    expect(parsear_invitar("  prov 123456  ")).toBe("123456");
    expect(parsear_invitar("Prov   654321")).toBe("654321");
  });

  it("rechaza códigos mal formados y otros comandos", () => {
    expect(parsear_invitar("PROV 12345")).toBeNull();
    expect(parsear_invitar("PROV 1234567")).toBeNull();
    expect(parsear_invitar("PROV 12a456")).toBeNull();
    expect(parsear_invitar("PROV123456")).toBeNull();
    expect(parsear_invitar("VINCULAR 123456")).toBeNull();
    expect(parsear_invitar("")).toBeNull();
  });
});

describe("PROV-S2/S3 verificar_invitacion", () => {
  it("ok con formato válido, hash igual, vigente y sin usar", () => {
    expect(
      verificar_invitacion({ textoEntrante: "PROV 123456", codigoIngresadoHash: "h-ok", invitacion: INVITACION, ahoraMs: 500 }),
    ).toEqual({ ok: true });
  });

  it("formato cuando el texto no es un código PROV", () => {
    expect(
      verificar_invitacion({ textoEntrante: "hola", codigoIngresadoHash: "h-ok", invitacion: INVITACION, ahoraMs: 500 }),
    ).toEqual({ ok: false, motivo: "formato" });
  });

  it("codigo_invalido cuando no hay invitación o el hash no coincide", () => {
    expect(
      verificar_invitacion({ textoEntrante: "PROV 123456", codigoIngresadoHash: "h-ok", invitacion: null, ahoraMs: 500 }),
    ).toEqual({ ok: false, motivo: "codigo_invalido" });
    expect(
      verificar_invitacion({ textoEntrante: "PROV 123456", codigoIngresadoHash: "otro", invitacion: INVITACION, ahoraMs: 500 }),
    ).toEqual({ ok: false, motivo: "codigo_invalido" });
  });

  it("usado pesa antes que vencido y vencido cuando ahoraMs pasa expiraEn", () => {
    expect(
      verificar_invitacion({
        textoEntrante: "PROV 123456",
        codigoIngresadoHash: "h-ok",
        invitacion: { ...INVITACION, usado: true },
        ahoraMs: 500,
      }),
    ).toEqual({ ok: false, motivo: "usado" });
    expect(
      verificar_invitacion({ textoEntrante: "PROV 123456", codigoIngresadoHash: "h-ok", invitacion: INVITACION, ahoraMs: 2_000 }),
    ).toEqual({ ok: false, motivo: "vencido" });
  });
});

describe("PROV-S4 puede_mandar y contacto_por_numero", () => {
  const base: Omit<ContactoProveedor, "estado"> = {
    numeroE164: "+5491100000000",
    tenantId: "t-1",
    supplierCuit: null,
    creadoEn: "2026-10-19T12:00:00.000Z",
  };

  it("solo el contacto verificado puede mandar", () => {
    expect(puede_mandar({ ...base, estado: "verificado" })).toBe(true);
    expect(puede_mandar({ ...base, estado: "pendiente" })).toBe(false);
    expect(puede_mandar({ ...base, estado: "revocado" })).toBe(false);
  });

  it("contacto_por_numero devuelve el contacto o null", () => {
    const contactos = new Map<string, ContactoProveedor>([[base.numeroE164, { ...base, estado: "pendiente" }]]);
    expect(contacto_por_numero(contactos, base.numeroE164)?.estado).toBe("pendiente");
    expect(contacto_por_numero(contactos, "+5491199999999")).toBeNull();
  });
});
