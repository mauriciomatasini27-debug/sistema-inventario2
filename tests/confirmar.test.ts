import { describe, expect, it } from "vitest";
import { puedeConfirmar, textosConfirmar } from "../src/lib/confirmar.js";

describe("confirmar: comparación de nombre tipeado", () => {
  it("ignora espacios al borde, mayúsculas y acentos", () => {
    expect(puedeConfirmar("  Almacén  ", "almacen")).toBe(true);
    expect(puedeConfirmar("almacen", "Almacén")).toBe(true);
    expect(puedeConfirmar("ROTACION", "Rotación")).toBe(true);
    expect(puedeConfirmar("bebidas", "Bebidas")).toBe(true);
  });

  it("rechaza un nombre distinto", () => {
    expect(puedeConfirmar("Bebidas", "Almacén")).toBe(false);
    expect(puedeConfirmar("", "Almacén")).toBe(false);
    expect(puedeConfirmar("Almacén extra", "Almacén")).toBe(false);
  });

  it("sin nombre esperado no exige escribir nada", () => {
    expect(puedeConfirmar("", "")).toBe(true);
    expect(puedeConfirmar("lo que sea", "   ")).toBe(true);
  });
});

describe("confirmar: textos del diálogo", () => {
  it("arma el texto desde las opciones y usa Confirmar por defecto", () => {
    const textos = textosConfirmar({ titulo: "Registrar egreso", mensaje: "Vas a sacar plata." });
    expect(textos.titulo).toBe("Registrar egreso");
    expect(textos.mensaje).toBe("Vas a sacar plata.");
    expect(textos.accion).toBe("Confirmar");
    expect(textos.nombreRequerido).toBeNull();
    expect(textos.ayudaNombre).toBe("");
  });

  it("cuando hay nombre requerido lo expone y explica qué escribir", () => {
    const textos = textosConfirmar({
      titulo: "Desactivar módulo",
      mensaje: "Vas a apagarlo.",
      accion: "Desactivar",
      nombreRequerido: "  Rotación y reposición  ",
    });
    expect(textos.accion).toBe("Desactivar");
    expect(textos.nombreRequerido).toBe("Rotación y reposición");
    expect(textos.ayudaNombre).toContain("Rotación y reposición");
  });

  it("un nombre requerido vacío no pide escribir", () => {
    const textos = textosConfirmar({ titulo: "t", mensaje: "m", nombreRequerido: "   " });
    expect(textos.nombreRequerido).toBeNull();
  });
});
