import { describe, expect, it } from "vitest";
import {
  armar_pedido_c,
  armar_pedido_con_receptor,
  armar_qr_payload,
  determinar_clase,
  idempotency_key_for_sale,
  idempotency_key_for_sale_tipo,
  resolver_consulta,
  resolver_receptor,
  siguiente_numero,
  validar_cuit,
} from "../src/modules/fiscal/fiscal.js";

describe("fiscal slice mínimo", () => {
  it("idempotency por venta es estable", () => {
    expect(idempotency_key_for_sale("s1")).toBe("sale:s1:11");
  });

  it("secuencia es last+1", () => {
    expect(siguiente_numero(124)).toBe(125);
  });

  it("CUIT válida pasa, inválida no", () => {
    expect(validar_cuit("20-93333172-6")).toBe(true);
    expect(validar_cuit("20933331726")).toBe(true);
    expect(validar_cuit("20933331725")).toBe(false);
  });

  it("pedido C mapea total a ImpTotal=ImpNeto sin IVA", () => {
    const p = armar_pedido_c({ saleId: "s1", totalCentavos: 266000n, ptoVta: 3, cbteNro: 125, cbteFch: "20261010" });
    expect(p?.impTotal).toBe(266000n);
    expect(p?.impNeto).toBe(266000n);
    expect(p?.cbteDesde).toBe(p?.cbteHasta);
  });

  it("pedido inválido da null", () => {
    expect(armar_pedido_c({ saleId: "s", totalCentavos: 0n, ptoVta: 3, cbteNro: 1, cbteFch: "20261010" })).toBeNull();
    expect(armar_pedido_c({ saleId: "s", totalCentavos: 100n, ptoVta: 0, cbteNro: 1, cbteFch: "20261010" })).toBeNull();
  });

  it("QR lleva base + CAE", () => {
    const qr = armar_qr_payload({ fecha: "2026-10-10", cuit: 20933331726, ptoVta: 3, nroCmp: 125, importeCentavos: 266000n, cae: "12345678901234" });
    expect(qr.startsWith("https://www.arca.gob.ar/fe/qr/?p=")).toBe(true);
    const json = JSON.parse(Buffer.from(qr.split("?p=")[1]!, "base64").toString("utf-8"));
    expect(json.codAut).toBe("12345678901234");
    expect(json.tipoCodAut).toBe("E");
  });

  it("consulta timeout decide sin duplicar", () => {
    expect(resolver_consulta(false, false).decision).toBe("reenviar-mismo-numero");
    expect(resolver_consulta(true, true).decision).toBe("tomar-cae");
    expect(resolver_consulta(true, false).decision).toBe("pausar-alerta");
  });

  it("S7: monotributo/exento siempre C, RI etapa2 a CF/exento/NC es B", () => {
    expect(determinar_clase("monotributo", "responsable_inscripto", 1)).toBe(11);
    expect(determinar_clase("exento", "consumidor_final", 1)).toBe(11);
    expect(determinar_clase("responsable_inscripto", "consumidor_final", 1)).toBeNull();
    expect(determinar_clase("responsable_inscripto", "consumidor_final", 2)).toBe(6);
    expect(determinar_clase("responsable_inscripto", "exento", 2)).toBe(6);
    expect(determinar_clase("responsable_inscripto", "no_categorizado", 2)).toBe(6);
    expect(determinar_clase("responsable_inscripto", "responsable_inscripto", 2)).toBeNull();
    expect(determinar_clase("responsable_inscripto", "monotributo", 2)).toBeNull();
  });

  it("S8: $3.500 sin datos va a CF, $10M exacta pide DNI online y espera offline", () => {
    expect(resolver_receptor({ totalCentavos: 350000n, offline: false })).toEqual({
      ok: true,
      docTipo: 99,
      docNro: "0",
      condIvaReceptor: 5,
    });
    expect(resolver_receptor({ totalCentavos: 999999999n, offline: false }).ok).toBe(true);
    expect(resolver_receptor({ totalCentavos: 1000000000n, offline: false })).toEqual({ ok: false, codigo: "pide_dni" });
    expect(resolver_receptor({ totalCentavos: 1000000000n, offline: true })).toEqual({ ok: false, codigo: "en_espera_de_datos" });
  });

  it("S8: $800 con CUIT a pedido valida dígito y exige condición", () => {
    expect(resolver_receptor({ totalCentavos: 80000n, offline: false, cuit: "20-93333172-6", condIvaReceptor: 5 })).toEqual({
      ok: true,
      docTipo: 80,
      docNro: "20933331726",
      condIvaReceptor: 5,
    });
    expect(resolver_receptor({ totalCentavos: 80000n, offline: false, cuit: "20933331725", condIvaReceptor: 5 })).toEqual({
      ok: false,
      codigo: "cuit_invalido",
    });
    expect(resolver_receptor({ totalCentavos: 80000n, offline: false, cuit: "20-93333172-6" })).toEqual({
      ok: false,
      codigo: "condicion_invalida",
    });
  });

  it("pedido con receptor arma C/B y rechaza tipos fuera del slice", () => {
    const base = { saleId: "s", totalCentavos: 100n, ptoVta: 3, cbteNro: 1, cbteFch: "20261010" } as const;
    expect(armar_pedido_con_receptor({ ...base, cbteTipo: 11, docTipo: 99, docNro: "0", condIvaReceptor: 5 })?.cbteTipo).toBe(11);
    expect(armar_pedido_con_receptor({ ...base, cbteTipo: 6, docTipo: 99, docNro: "0", condIvaReceptor: 5 })?.cbteTipo).toBe(6);
    const cuit = armar_pedido_con_receptor({ ...base, cbteTipo: 11, docTipo: 80, docNro: "20933331726", condIvaReceptor: 5 });
    expect(cuit?.docNro).toBe(20933331726n);
    expect(armar_pedido_con_receptor({ ...base, cbteTipo: 1, docTipo: 99, docNro: "0", condIvaReceptor: 5 })).toBeNull();
    expect(armar_pedido_con_receptor({ ...base, cbteTipo: 11, docTipo: 96, docNro: "0", condIvaReceptor: 5 })).toBeNull();
    expect(idempotency_key_for_sale_tipo("s1", 6)).toBe("sale:s1:6");
  });
});
