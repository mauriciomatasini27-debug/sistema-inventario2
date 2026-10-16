import { describe, expect, it } from "vitest";
import {
  PLANTILLAS_RUBRO,
  UMBRAL_SUGERIDO,
  VERSION_PLANTILLAS_RUBRO,
  plantilla_rubro,
} from "../src/modules/onboarding/plantillas-rubro.js";

describe("plantillas por rubro ON4", () => {
  it("kiosco trae las 6 ubicaciones del PRD", () => {
    expect(plantilla_rubro("kiosco").ubicaciones).toEqual([
      "Mostrador",
      "Góndola 1",
      "Heladera 1",
      "Exhibidor de golosinas",
      "Estante detrás del mostrador",
      "Depósito",
    ]);
  });

  it("librería no trae heladera ni freezer", () => {
    const ubis = plantilla_rubro("libreria").ubicaciones;
    expect(ubis).toContain("Vitrina");
    expect(ubis.some((u) => /heladera|freezer/i.test(u))).toBe(false);
  });

  it("rubro desconocido cae a otro", () => {
    expect(plantilla_rubro("dietetica")).toEqual(PLANTILLAS_RUBRO["otro"]);
  });

  it("las plantillas viven versionadas en el código", () => {
    expect(VERSION_PLANTILLAS_RUBRO).toBe("v1");
    expect(Object.keys(PLANTILLAS_RUBRO).sort()).toEqual(["almacen", "despensa", "kiosco", "libreria", "otro"]);
  });

  it("el umbral sugerido no se aplica solo", () => {
    expect(UMBRAL_SUGERIDO).toBe(3);
    expect("productos" in plantilla_rubro("kiosco")).toBe(false);
  });
});
