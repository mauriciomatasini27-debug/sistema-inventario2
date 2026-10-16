import { describe, expect, it } from "vitest";
import { armar_tra_xml, firmar_tra_cms, tra_times } from "../src/modules/fiscal/tra.js";
import { generarCertificadoPrueba, opensslDisponible } from "./helpers/openssl-cert.js";
import {
  consultar_envelope,
  dummy_envelope,
  login_cms_envelope,
  parse_consultar_response,
  parse_login_cms_response,
  parse_solicitar_response,
  parse_ultimo_response,
  solicitar_envelope,
  ultimo_envelope,
} from "../src/modules/fiscal/wsfe.js";

describe("fase 0 wsaa/wsfe", () => {
  it("TRA ventana 20 min y uniqueId estable", () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const t = tra_times(now);
    expect(new Date(t.expirationTime).getTime() - new Date(t.generationTime).getTime()).toBe(20 * 60 * 1000);
    const xml = armar_tra_xml({ ...t, service: "wsfe" });
    expect(xml).toContain("<service>wsfe</service>");
  });

  it.skipIf(!opensslDisponible())("CMS firma con certificado de prueba", () => {
    const { certPem, keyPem } = generarCertificadoPrueba();
    const cms = firmar_tra_cms("<loginTicketRequest/>", certPem, keyPem);
    expect(cms.length).toBeGreaterThan(100);
  });

  it("envelopes llevan Auth y parsers extraen", () => {
    const auth = { token: "T", sign: "S", cuit: "20933331726" };
    expect(ultimo_envelope(auth, 3, 11)).toContain("<Cuit>20933331726</Cuit>");
    expect(login_cms_envelope("ABC")).toContain("<in0>ABC</in0>");
    expect(dummy_envelope()).toContain("FEDummy");
    expect(parse_login_cms_response("<a><token>T</token><sign>S</sign></a>")).toEqual({ token: "T", sign: "S" });
    expect(parse_login_cms_response("<a/>")).toBeNull();
    expect(parse_ultimo_response("<r><CbteNro>124</CbteNro></r>")).toBe(124);
  });

  it("solicitar arma 1 comprobante C y parsea CAE", () => {
    const auth = { token: "T", sign: "S", cuit: "20933331726" };
    const xml = solicitar_envelope(auth, "20933331726", 3, 11, {
      concepto: 1,
      docTipo: 99,
      docNro: "0",
      cbteDesde: 125,
      cbteHasta: 125,
      cbteFch: "20261010",
      impTotal: "2660.00",
      impNeto: "2660.00",
      monId: "PES",
      monCotiz: 1,
      condIvaReceptorId: 5,
    });
    expect(xml).toContain("<CbteDesde>125</CbteDesde>");
    expect(xml).toContain("<CondicionIVAReceptorId>5</CondicionIVAReceptorId>");
    const r = parse_solicitar_response("<r><Resultado>A</Resultado><CAE>12345678901234</CAE><CAEFchVto>2026-10-25</CAEFchVto></r>");
    expect(r).toEqual({ cae: "12345678901234", caeVto: "2026-10-25", resultado: "A" });
    expect(parse_solicitar_response("<r><Resultado>R</Resultado></r>")).toBeNull();
  });

  it("consultar arma pedido y parsea coincidencia", () => {
    const auth = { token: "T", sign: "S", cuit: "20933331726" };
    expect(consultar_envelope(auth, 11, 3, 125)).toContain("<CbteNro>125</CbteNro>");
    const d = parse_consultar_response(
      "<r><CodAutorizacion>12345678901234</CodAutorizacion><DocTipo>99</DocTipo><DocNro>0</DocNro><ImpTotal>2660.00</ImpTotal><CbteFch>20261010</CbteFch></r>",
    );
    expect(d?.cae).toBe("12345678901234");
    expect(parse_consultar_response("<r/>")).toBeNull();
  });
});
