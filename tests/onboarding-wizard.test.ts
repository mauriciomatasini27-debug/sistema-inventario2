import { describe, it, expect } from "vitest";
import {
  estadoInicialWizard,
  pasoActual,
  avanzar,
  saltar,
  agregarEmpleado,
  quitarEmpleado,
  completarEmpleados,
  marcarCompletado,
  esCompleto,
  retomar,
  PASOS_WIZARD,
} from "../src/modules/onboarding/wizard.js";

describe("onboarding-wizard (T1)", () => {
  it("estado inicial en paso 0, no completado", () => {
    const s = estadoInicialWizard();
    expect(s.paso).toBe(0);
    expect(s.completado).toBe(false);
    expect(pasoActual(s)?.key).toBe("negocio");
  });

  it("avanzar con texto vacío no avanza", () => {
    const s = estadoInicialWizard();
    const s2 = avanzar(s, "   ");
    expect(s2.paso).toBe(0);
  });

  it("avanzar con nombre de negocio avanza y guarda respuesta", () => {
    const s = estadoInicialWizard();
    const s2 = avanzar(s, "Kiosco Pepe");
    expect(s2.paso).toBe(1);
    expect(s2.respuestas.negocio).toBe("Kiosco Pepe");
  });

  it("saltar marca pendiente y avanza", () => {
    const s = estadoInicialWizard();
    const s2 = saltar(s);
    expect(s2.paso).toBe(1);
    expect(s2.saltados).toContain("negocio");
  });

  it("empleados: Sí activa sub-flujo sin avanzar", () => {
    let s = estadoInicialWizard();
    s = avanzar(s, "Kiosco"); // negocio
    s = avanzar(s, "Pepe"); // dueno
    const s2 = avanzar(s, "Sí, tengo empleados");
    expect(s2.paso).toBe(2);
    expect(s2.empleadosDone).toBe(false);
    expect(s2.respuestas.empleados).toBe("Sí, tengo empleados");
  });

  it("empleados: agregar y quitar", () => {
    let s = estadoInicialWizard();
    s = agregarEmpleado(s, "  Juan  ");
    expect(s.empleados).toEqual(["Juan"]);
    s = agregarEmpleado(s, "");
    expect(s.empleados).toEqual(["Juan"]);
    s = quitarEmpleado(s, 0);
    expect(s.empleados).toEqual([]);
  });

  it("empleados: completar avanza al siguiente paso", () => {
    let s = estadoInicialWizard();
    s = avanzar(s, "Kiosco");
    s = avanzar(s, "Pepe");
    s = avanzar(s, "Sí, tengo empleados");
    s = agregarEmpleado(s, "Juan");
    const s2 = completarEmpleados(s);
    expect(s2.paso).toBe(3);
    expect(s2.empleadosDone).toBe(true);
  });

  it("empleados: No avanza directo", () => {
    let s = estadoInicialWizard();
    s = avanzar(s, "Kiosco");
    s = avanzar(s, "Pepe");
    const s2 = avanzar(s, "No, trabajo solo");
    expect(s2.paso).toBe(3);
  });

  it("completar todos los pasos", () => {
    let s = estadoInicialWizard();
    s = avanzar(s, "Kiosco");
    s = avanzar(s, "Pepe");
    s = avanzar(s, "No, trabajo solo");
    s = avanzar(s, "Más tarde");
    s = avanzar(s, "Empezar en 0");
    expect(s.paso).toBe(5);
    const s2 = marcarCompletado(s);
    expect(esCompleto(s2)).toBe(true);
    expect(pasoActual(s2)).toBeNull();
  });

  it("retomar restaura paso, respuestas, empleados, saltados", () => {
    const s = retomar(2, { negocio: "Kiosco" }, ["Juan"], ["negocio"]);
    expect(s.paso).toBe(2);
    expect(s.respuestas.negocio).toBe("Kiosco");
    expect(s.empleados).toEqual(["Juan"]);
    expect(s.saltados).toEqual(["negocio"]);
  });

  it("no muta el estado original", () => {
    const s = estadoInicialWizard();
    const s2 = avanzar(s, "Kiosco");
    expect(s.paso).toBe(0);
    expect(s2.paso).toBe(1);
  });

  it("PASOS_WIZARD tiene 5 pasos", () => {
    expect(PASOS_WIZARD.length).toBe(5);
  });
});
