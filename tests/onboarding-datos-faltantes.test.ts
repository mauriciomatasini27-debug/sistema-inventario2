import { describe, expect, it } from "vitest";
import {
  avanzar,
  estadoInicialWizard,
  esCompleto,
  pasoActual,
  pasosParaDatos,
  retomar,
} from "../src/modules/onboarding/wizard.js";

describe("TB-165: el cuestionario pregunta sólo lo que falta", () => {
  it("con rubro y WhatsApp conocidos no se preguntan", () => {
    expect(pasosParaDatos({ rubro: "kiosco", whatsapp: "5491112345678" }).map((p) => p.key)).toEqual([
      "empleados", "productos", "caja",
    ]);
  });

  it("sin datos conocidos se preguntan rubro y WhatsApp primero", () => {
    expect(pasosParaDatos({}).map((p) => p.key)).toEqual([
      "rubro", "whatsapp", "empleados", "productos", "caja",
    ]);
  });

  it("sólo se agrega el paso del dato que falta", () => {
    expect(pasosParaDatos({ rubro: "kiosco" }).map((p) => p.key)).toEqual([
      "whatsapp", "empleados", "productos", "caja",
    ]);
    expect(pasosParaDatos({ whatsapp: "5491112345678" }).map((p) => p.key)).toEqual([
      "rubro", "empleados", "productos", "caja",
    ]);
  });

  it("el estado inicial arranca por el dato faltante y lo guarda al avanzar", () => {
    let s = estadoInicialWizard();
    expect(pasoActual(s)?.key).toBe("rubro");
    s = avanzar(s, "Dietética");
    expect(s.respuestas.rubro).toBe("Dietética");
    expect(pasoActual(s)?.key).toBe("whatsapp");
    s = avanzar(s, "5491112345678");
    expect(s.respuestas.whatsapp).toBe("5491112345678");
    expect(pasoActual(s)?.key).toBe("empleados");
  });

  it("retomar respeta la cantidad de pasos según los datos disponibles", () => {
    expect(retomar(0, {}, [], [], {}).pasos).toHaveLength(5);
    expect(retomar(0, {}, [], [], { rubro: "kiosco", whatsapp: "5491112345678" }).pasos).toHaveLength(3);
  });

  it("no se completa hasta recorrer todos los pasos disponibles", () => {
    const s = retomar(0, {}, [], [], { rubro: "kiosco", whatsapp: "5491112345678" });
    expect(esCompleto(s)).toBe(false);
    expect(esCompleto({ ...s, paso: s.pasos.length })).toBe(true);
  });
});
