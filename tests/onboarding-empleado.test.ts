import { describe, expect, it } from "vitest";
import { bienvenida_empleado, checklist_empleado, mensaje_numero_en_uso } from "../src/modules/onboarding/empleado.js";

describe("empleado ON11", () => {
  it("la bienvenida es corta y libre sin plantilla", () => {
    const texto = bienvenida_empleado("Juan", "Kiosco La Esquina");
    expect(texto).toContain("¿dónde está");
    expect(texto.length).toBeLessThan(200);
  });

  it("la checklist propia tiene 3 pasos", () => {
    expect(checklist_empleado()).toHaveLength(3);
  });

  it("el duplicado no revela el otro comercio", () => {
    expect(mensaje_numero_en_uso()).not.toContain("Kiosco");
  });
});
