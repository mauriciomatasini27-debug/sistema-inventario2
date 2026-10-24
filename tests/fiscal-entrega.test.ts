import { describe, expect, it } from "vitest";
import { emitir_constancia, evaluar_cuestionario, type CuestionarioEntrega } from "../src/modules/fiscal/entrega.js";

const LEYENDA = "DOCUMENTO NO VÁLIDO COMO REMITO";
const LINK_WSREMCARNE = "https://www.arca.gob.ar/ws/remitoElecCarnico/Manual_Desarrollador_WSREMCARNE_v3_5.pdf";
const LINK_WSREMHARINA = "https://arca.gob.ar/ws/remitoHTSDMT/Manual_Desarrollador_WSREMHARINA_v2.9.pdf";
const LINK_COT_ARBA =
  "https://web.arba.gov.ar/preguntas-frecuentes/que-es-el-cot-quienes-y-bajo-que-condiciones-estan-obligados-generarlo-en-que";
const PESOS_JUSTOS = 9_529_691n * 100n;

function cuestionario(over: Partial<CuestionarioEntrega> = {}): CuestionarioEntrega {
  return {
    carne: false,
    harina: false,
    trasladoBuenosAires: false,
    kilos: 0,
    importeCentavos: 0n,
    ...over,
  };
}

describe("constancia de entrega (FE-S28)", () => {
  it("sin factura fiscal emite la leyenda y el título no lleva remito ni la letra R", () => {
    const constancia = emitir_constancia();

    expect(constancia.leyenda).toBe(LEYENDA);
    expect(constancia.titulo).toBe("Constancia de entrega interna");
    expect(constancia.titulo.toLowerCase()).not.toContain("remito");
    expect(constancia.titulo).not.toMatch(/\bR\b/);
    expect(constancia.letra).toBeNull();
    expect(constancia).toEqual({
      titulo: "Constancia de entrega interna",
      leyenda: LEYENDA,
      letra: null,
    });

    const fueraDeLaLeyenda = `${constancia.titulo} ${String(constancia.letra)}`;
    expect(fueraDeLaLeyenda.toLowerCase()).not.toContain("remito");
    expect(fueraDeLaLeyenda).not.toMatch(/\bR\b/);
  });
});

describe("cuestionario de regímenes (FE-S28)", () => {
  it("sin marcas devuelve cero avisos y no emite", () => {
    expect(evaluar_cuestionario(cuestionario())).toEqual({ avisos: [], emite: false });
  });

  it("carne avisa wsremcarne RG 5259 con link y no emite", () => {
    expect(evaluar_cuestionario(cuestionario({ carne: true }))).toEqual({
      emite: false,
      avisos: [{ regimen: "wsremcarne", texto: "wsremcarne RG 5259", link: LINK_WSREMCARNE }],
    });
  });

  it("harina avisa wsremharina RG 5264 con link y no emite", () => {
    expect(evaluar_cuestionario(cuestionario({ harina: true }))).toEqual({
      emite: false,
      avisos: [{ regimen: "wsremharina", texto: "wsremharina RG 5264", link: LINK_WSREMHARINA }],
    });
  });

  it("traslado en Buenos Aires por encima de 4.500 kg avisa COT ARBA y no emite", () => {
    const justo = evaluar_cuestionario(cuestionario({ trasladoBuenosAires: true, kilos: 4_500, importeCentavos: PESOS_JUSTOS }));
    const porKilos = evaluar_cuestionario(cuestionario({ trasladoBuenosAires: true, kilos: 4_501, importeCentavos: PESOS_JUSTOS }));
    const porPesos = evaluar_cuestionario(
      cuestionario({ trasladoBuenosAires: true, kilos: 4_500, importeCentavos: PESOS_JUSTOS + 1n }),
    );
    const aviso = { regimen: "cot-arba", texto: "COT ARBA", link: LINK_COT_ARBA };

    expect(justo).toEqual({ avisos: [], emite: false });
    expect(porKilos).toEqual({ avisos: [aviso], emite: false });
    expect(porPesos).toEqual({ avisos: [aviso], emite: false });
  });

  it("fuera de Buenos Aires no avisa COT aunque supere peso e importe", () => {
    expect(
      evaluar_cuestionario(cuestionario({ trasladoBuenosAires: false, kilos: 9_000, importeCentavos: PESOS_JUSTOS + 1n })),
    ).toEqual({ avisos: [], emite: false });
  });

  it("las tres marcas juntas solo avisan y no emiten", () => {
    const resultado = evaluar_cuestionario(
      cuestionario({
        carne: true,
        harina: true,
        trasladoBuenosAires: true,
        kilos: 4_501,
        importeCentavos: PESOS_JUSTOS + 1n,
      }),
    );

    expect(resultado.emite).toBe(false);
    expect(resultado.avisos.map((aviso) => aviso.regimen)).toEqual(["wsremcarne", "wsremharina", "cot-arba"]);
    expect(resultado).toEqual({
      emite: false,
      avisos: [
        { regimen: "wsremcarne", texto: "wsremcarne RG 5259", link: LINK_WSREMCARNE },
        { regimen: "wsremharina", texto: "wsremharina RG 5264", link: LINK_WSREMHARINA },
        { regimen: "cot-arba", texto: "COT ARBA", link: LINK_COT_ARBA },
      ],
    });
    expect(JSON.stringify(resultado)).not.toMatch(/CAE|FECAE|wsfe|CbteTipo|solicitud/i);
  });
});
