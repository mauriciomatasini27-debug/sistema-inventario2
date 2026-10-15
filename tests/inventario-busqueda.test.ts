import { describe, expect, it } from "vitest";
import { coincideDifuso, inicialesProducto, normalizarBusqueda } from "../src/modules/inventario/busqueda.js";

describe("P3-1 busqueda difusa pura", () => {
  it("normaliza tildes, mayusculas y espacios", () => {
    expect(normalizarBusqueda("  Café   con  Leche ")).toBe("CAFE CON LECHE");
  });

  it("un typo (distancia 1) coincide", () => {
    expect(coincideDifuso(["YERBA-1", "Yerba Mate"], "yerva")).toBe(true);
  });

  it("el orden de tokens no importa", () => {
    expect(coincideDifuso(["YERBA-1", "Yerba Mate"], "mate yerba")).toBe(true);
  });

  it("sin relacion no coincide", () => {
    expect(coincideDifuso(["LECHE-1", "Leche Entera"], "cafe")).toBe(false);
  });

  it("cafe normalizado coincide con Café Torrado", () => {
    expect(coincideDifuso(["CAFE-1", "Café Torrado"], "cafe")).toBe(true);
  });

  it("token corto solo vale por subcadena", () => {
    expect(coincideDifuso(["YERBA-1", "Yerba Mate"], "ye")).toBe(true);
    expect(coincideDifuso(["YERBA-1", "Yerba Mate"], "xe")).toBe(false);
  });

  it("typo de distancia 2 no coincide", () => {
    expect(coincideDifuso(["YERBA-1", "Yerba Mate"], "yarva")).toBe(false);
  });

  it("q en blanco coincide con todo", () => {
    expect(coincideDifuso(["LECHE-1", "Leche Entera"], "")).toBe(true);
    expect(coincideDifuso(["LECHE-1", "Leche Entera"], "   ")).toBe(true);
  });
});

describe("P3-1 iniciales de placeholder", () => {
  it("dos o mas palabras usan la primera letra de las dos primeras", () => {
    expect(inicialesProducto("Yerba Mate Playadito")).toBe("YM");
  });

  it("una sola palabra usa sus dos primeras letras", () => {
    expect(inicialesProducto("Yerba")).toBe("YE");
  });

  it("ignora espacios y tildes", () => {
    expect(inicialesProducto("  café  con leche")).toBe("CC");
  });

  it("la enie vale como ene", () => {
    expect(inicialesProducto("Ñoquis")).toBe("NO");
  });

  it("vacio devuelve interrogante", () => {
    expect(inicialesProducto("")).toBe("?");
    expect(inicialesProducto("   ")).toBe("?");
  });
});
