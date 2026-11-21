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

// TB-165 [tenant]: estos casos asumen que el alta ya capturó rubro y WhatsApp del comercio.
const inicial = () => estadoInicialWizard({ rubro: "kiosco", whatsapp: "5491112345678" });

describe("onboarding-wizard (T1)", () => {
  it("TB-165: solo pregunta lo que aún no se conoce", () => {
    const claves = PASOS_WIZARD.map((p) => p.key);
    expect(claves).toEqual(["empleados", "productos", "caja"]);
    for (const conocido of ["negocio", "dueno", "rubro", "whatsapp"]) {
      expect(claves).not.toContain(conocido);
    }
  });

  it("estado inicial en el paso de empleados, no completado", () => {
    const s = inicial();
    expect(s.paso).toBe(0);
    expect(s.completado).toBe(false);
    expect(pasoActual(s)?.key).toBe("empleados");
  });

  it("empleados: Sí activa sub-flujo sin avanzar", () => {
    const s = avanzar(inicial(), "Sí, tengo empleados");
    expect(s.paso).toBe(0);
    expect(s.empleadosDone).toBe(false);
    expect(s.respuestas.empleados).toBe("Sí, tengo empleados");
  });

  it("empleados: agregar y quitar", () => {
    let s = agregarEmpleado(inicial(), "  Juan  ");
    expect(s.empleados).toEqual(["Juan"]);
    s = agregarEmpleado(s, "");
    expect(s.empleados).toEqual(["Juan"]);
    s = quitarEmpleado(s, 0);
    expect(s.empleados).toEqual([]);
  });

  it("empleados: completar avanza al siguiente paso", () => {
    let s = avanzar(inicial(), "Sí, tengo empleados");
    s = agregarEmpleado(s, "Juan");
    const s2 = completarEmpleados(s);
    expect(s2.paso).toBe(1);
    expect(s2.empleadosDone).toBe(true);
  });

  it("empleados: No avanza directo", () => {
    const s = avanzar(inicial(), "No, trabajo solo");
    expect(s.paso).toBe(1);
  });

  it("saltar marca pendiente y avanza", () => {
    const s = saltar(inicial());
    expect(s.paso).toBe(1);
    // TB-165 [tenant]: el id de «no aplica» es el del checklist (singular).
    expect(s.saltados).toContain("empleado");
    expect(s.saltados).not.toContain("empleados");
  });

  it("completar todos los pasos desconocidos", () => {
    let s = avanzar(inicial(), "No, trabajo solo");
    s = avanzar(s, "Más tarde");
    s = avanzar(s, "Empezar en 0");
    expect(s.paso).toBe(PASOS_WIZARD.length);
    expect(esCompleto(marcarCompletado(s))).toBe(true);
    expect(pasoActual(marcarCompletado(s))).toBeNull();
  });

  it("retomar restaura paso, respuestas, empleados, saltados", () => {
    const s = retomar(1, { empleados: "No, trabajo solo" }, ["Juan"], ["empleados"]);
    expect(s.paso).toBe(1);
    expect(s.respuestas.empleados).toBe("No, trabajo solo");
    expect(s.empleados).toEqual(["Juan"]);
    expect(s.saltados).toEqual(["empleados"]);
  });

  it("no muta el estado original", () => {
    const s = inicial();
    const s2 = avanzar(s, "No, trabajo solo");
    expect(s.paso).toBe(0);
    expect(s2.paso).toBe(1);
  });
});
