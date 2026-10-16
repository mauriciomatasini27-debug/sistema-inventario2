import { describe, expect, it } from "vitest";
import {
  CONDICIONES_IVA_RECEPTOR,
  armar_pedido_b,
  armar_pedido_con_receptor,
  condicion_iva_receptor_valida,
  resolver_receptor,
} from "../src/modules/fiscal/fiscal.js";
import {
  condicion_iva_receptor_envelope,
  parse_condicion_iva_receptor_response,
} from "../src/modules/fiscal/wsfe.js";

// Tabla vigente ARCA (FEParamGetCondicionIvaReceptor): 11 IDs con clase
// (1, 4-9, 10, 13, 15, 16); lo fuera de la tabla se rechaza.
describe("condición IVA receptor ARCA", () => {
  it("tabla tiene los 11 IDs vigentes con descripción y clase", () => {
    const ids = CONDICIONES_IVA_RECEPTOR.map((c) => c.id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16]);
    for (const c of CONDICIONES_IVA_RECEPTOR) {
      expect(c.desc.length).toBeGreaterThan(0);
      expect(["A/M/C", "B/C"]).toContain(c.clases);
    }
    expect(CONDICIONES_IVA_RECEPTOR.find((c) => c.id === 5)?.desc).toBe("Consumidor Final");
    expect(CONDICIONES_IVA_RECEPTOR.find((c) => c.id === 1)?.desc).toBe("IVA Responsable Inscripto");
  });

  it("validador acepta 10/13/15/16 y rechaza 2/3/0/negativos", () => {
    for (const id of [1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16]) {
      expect(condicion_iva_receptor_valida(id)).toBe(true);
    }
    for (const id of [0, 2, 3, 11, 12, 14, 17, -1]) {
      expect(condicion_iva_receptor_valida(id)).toBe(false);
    }
  });

  it("resolver_receptor rechaza CUIT con condición 2 y acepta con 16", () => {
    expect(
      resolver_receptor({ totalCentavos: 80000n, offline: false, cuit: "20-93333172-6", condIvaReceptor: 2 }),
    ).toEqual({ ok: false, codigo: "condicion_invalida" });
    expect(
      resolver_receptor({ totalCentavos: 80000n, offline: false, cuit: "20-93333172-6", condIvaReceptor: 16 }),
    ).toEqual({ ok: true, docTipo: 80, docNro: "20933331726", condIvaReceptor: 16 });
  });

  it("armadores rechazan 3 y aceptan 10/13/15", () => {
    const base = { saleId: "s", totalCentavos: 100n, ptoVta: 3, cbteNro: 1, cbteFch: "20261010" } as const;
    expect(armar_pedido_con_receptor({ ...base, cbteTipo: 11, docTipo: 99, docNro: "0", condIvaReceptor: 3 })).toBeNull();
    expect(
      armar_pedido_con_receptor({ ...base, cbteTipo: 11, docTipo: 99, docNro: "0", condIvaReceptor: 10 })?.condIvaReceptor,
    ).toBe(10);
    expect(
      armar_pedido_b({
        totalCentavos: 12100n,
        ptoVta: 3,
        cbteNro: 1,
        cbteFch: "20261010",
        docTipo: 99,
        docNro: "0",
        condIvaReceptor: 2,
        impNetoCentavos: 10000n,
        impIvaCentavos: 2100n,
        alicId: 5,
      }),
    ).toBeNull();
    expect(
      armar_pedido_b({
        totalCentavos: 12100n,
        ptoVta: 3,
        cbteNro: 1,
        cbteFch: "20261010",
        docTipo: 99,
        docNro: "0",
        condIvaReceptor: 13,
        impNetoCentavos: 10000n,
        impIvaCentavos: 2100n,
        alicId: 5,
      })?.condIvaReceptor,
    ).toBe(13);
  });

  it("envelope pide FEParamGetCondicionIvaReceptor con ClaseCmp opcional", () => {
    const auth = { token: "T", sign: "S", cuit: "20933331726" };
    const sinClase = condicion_iva_receptor_envelope(auth);
    expect(sinClase).toContain("FEParamGetCondicionIvaReceptor");
    expect(sinClase).toContain("<Cuit>20933331726</Cuit>");
    expect(sinClase).not.toContain("ClaseCmp");
    expect(condicion_iva_receptor_envelope(auth, "A")).toContain("<ClaseCmp>A</ClaseCmp>");
  });

  it("parser extrae Id/Desc/Cmp_Clase y devuelve null sin entradas", () => {
    const xml =
      `<r><ResultGet>` +
      `<CondicionIvaReceptor><Id>5</Id><Desc>Consumidor Final</Desc><Cmp_Clase>B/C</Cmp_Clase></CondicionIvaReceptor>` +
      `<CondicionIvaReceptor><Id>16</Id><Desc>Monotributo Trabajador Independiente Promovido</Desc><Cmp_Clase>A/M/C</Cmp_Clase></CondicionIvaReceptor>` +
      `</ResultGet></r>`;
    expect(parse_condicion_iva_receptor_response(xml)).toEqual([
      { id: 5, desc: "Consumidor Final", clases: "B/C" },
      { id: 16, desc: "Monotributo Trabajador Independiente Promovido", clases: "A/M/C" },
    ]);
    expect(parse_condicion_iva_receptor_response("<r><ResultGet></ResultGet></r>")).toBeNull();
    expect(parse_condicion_iva_receptor_response("<r/>")).toBeNull();
  });
});
