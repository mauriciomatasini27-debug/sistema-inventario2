import { describe, expect, it } from "vitest";
import {
  crearPersistenciaOnboardingMemoria,
} from "../src/modules/onboarding/persistencia.js";
import {
  accionChecklist,
  calcularChecklist,
  completarWizard,
  completarWizardConEmpleados,
  leerOnboarding,
  marcarTourPaso,
  registrarVideo,
} from "../src/modules/onboarding/onboarding.js";
import {
  estadoInicialWizard,
  agregarEmpleado,
  marcarCompletado,
} from "../src/modules/onboarding/wizard.js";
import { claveOnboarding } from "../src/modules/onboarding/estado.js";

const USER = "g-1";
const TENANT = "t-1";
const CLAVE = claveOnboarding(USER, TENANT);

function seam() {
  return crearPersistenciaOnboardingMemoria();
}

describe("onboarding seam — PersistenciaOnboarding", () => {
  it("leer devuelve el estado inicial sin escribir", () => {
    const mem = seam();
    const estado = leerOnboarding(USER, TENANT, mem.persistencia);

    expect(estado.userId).toBe(USER);
    expect(estado.tenantId).toBe(TENANT);
    expect(estado.tourEstado).toBe("no_iniciado");
    expect(estado.wizardCompletado).toBe(false);
    expect(mem.estados.has(CLAVE)).toBe(false);
  });

  it("marcarTourPaso persiste avance y estado del tour", () => {
    const mem = seam();
    marcarTourPaso(USER, TENANT, 3, "en_curso", mem.persistencia);

    const guardado = mem.estados.get(CLAVE);
    expect(guardado?.tourUltimoPaso).toBe(3);
    expect(guardado?.tourEstado).toBe("en_curso");
  });

  it("accionChecklist acumula pasos saltados y retomar los quita", () => {
    const mem = seam();
    accionChecklist(USER, TENANT, "saltar", "whatsapp", mem.persistencia);
    accionChecklist(USER, TENANT, "saltar", "productos", mem.persistencia);
    accionChecklist(USER, TENANT, "saltar", "productos", mem.persistencia);
    expect(mem.estados.get(CLAVE)?.pasosSaltados).toEqual(["whatsapp", "productos"]);

    accionChecklist(USER, TENANT, "retomar", "whatsapp", mem.persistencia);
    expect(mem.estados.get(CLAVE)?.pasosSaltados).toEqual(["productos"]);
  });

  it("ocultar/mostrar cambian checklistOculta sin tocar los saltados", () => {
    const mem = seam();
    accionChecklist(USER, TENANT, "saltar", "productos", mem.persistencia);
    accionChecklist(USER, TENANT, "ocultar", undefined, mem.persistencia);
    expect(mem.estados.get(CLAVE)?.checklistOculta).toBe(true);
    expect(mem.estados.get(CLAVE)?.pasosSaltados).toEqual(["productos"]);

    accionChecklist(USER, TENANT, "mostrar", undefined, mem.persistencia);
    expect(mem.estados.get(CLAVE)?.checklistOculta).toBe(false);
  });

  it("registrarVideo actualiza progreso y marca visto al terminar", () => {
    const mem = seam();
    registrarVideo(USER, TENANT, 50, "mitad", mem.persistencia);
    expect(mem.estados.get(CLAVE)?.videoProgreso).toBe(50);
    expect(mem.estados.get(CLAVE)?.videoVisto).toBe(false);

    registrarVideo(USER, TENANT, 100, "fin", mem.persistencia);
    expect(mem.estados.get(CLAVE)?.videoProgreso).toBe(100);
    expect(mem.estados.get(CLAVE)?.videoVisto).toBe(true);
  });

  it("completarWizard puentea WizardState a OnboardingState", () => {
    const mem = seam();
    let wizard = estadoInicialWizard();
    wizard = agregarEmpleado(wizard, "Ana");
    wizard = agregarEmpleado(wizard, "Beto");
    wizard = marcarCompletado({ ...wizard, paso: wizard.pasos.length });
    const actualizado = completarWizard(USER, TENANT, wizard, mem.persistencia);

    expect(actualizado.wizardCompletado).toBe(true);
    expect(actualizado.wizardPaso).toBe(wizard.pasos.length);
    expect(actualizado.wizardEmpleados).toEqual(["Ana", "Beto"]);
    expect(mem.estados.get(CLAVE)?.wizardEmpleados).toEqual(["Ana", "Beto"]);
  });

  it("TB-165: completar conserva todas las respuestas, no sólo empleados", () => {
    const mem = seam();
    const base = estadoInicialWizard();
    const wizard = marcarCompletado({
      ...base,
      paso: base.pasos.length,
      respuestas: {
        empleados: "Sí, tengo empleados",
        productos: "Sí, cargar productos",
        caja: "Empezar en 0",
      },
    });
    const actualizado = completarWizard(USER, TENANT, wizard, mem.persistencia);

    expect(actualizado.wizardRespuestas).toEqual({
      empleados: "Sí, tengo empleados",
      productos: "Sí, cargar productos",
      caja: "Empezar en 0",
    });
    expect(mem.estados.get(CLAVE)?.wizardRespuestas.caja).toBe("Empezar en 0");
  });

  it("el mismo usuario en otro comercio tiene estado independiente", () => {
    const mem = seam();
    marcarTourPaso(USER, TENANT, 7, "completado", mem.persistencia);
    const otro = leerOnboarding(USER, "t-2", mem.persistencia);

    expect(otro.tourUltimoPaso).toBe(0);
    expect(otro.tenantId).toBe("t-2");
    expect(mem.estados.size).toBe(1);
  });

  it("completarWizardConEmpleados puentea desde la ruta sin armar un WizardState", () => {
    const mem = seam();
    const next = completarWizardConEmpleados(USER, TENANT, ["Ana"], mem.persistencia);

    expect(next.wizardCompletado).toBe(true);
    expect(next.wizardPaso).toBe(estadoInicialWizard().pasos.length);
    expect(next.wizardEmpleados).toEqual(["Ana"]);

    // TB-165: sin empleados en el body conserva los ya persistidos
    const otra = completarWizardConEmpleados(USER, TENANT, undefined, mem.persistencia);
    expect(otra.wizardEmpleados).toEqual(["Ana"]);
  });

  it("TB-165: saltar empleado lo marca no aplica y lo saca del progreso", () => {
    const mem = seam();
    accionChecklist(USER, TENANT, "saltar", "empleado", mem.persistencia);
    const foto = {
      productos: 0,
      productosConUmbral: 0,
      proveedores: 0,
      invitaciones: 0,
      whatsappVerificado: true,
    };
    const calculado = calcularChecklist(leerOnboarding(USER, TENANT, mem.persistencia), foto);
    const empleado = calculado.pasos.find((p) => p.id === "empleado");
    expect(empleado?.noAplica).toBe(true);
    expect(empleado?.listo).toBe(false);
    expect(calculado.total).toBe(calculado.pasos.length - 1);
  });

  it("calcularChecklist usa el snapshot y respeta checklistOculta", () => {
    const mem = seam();
    const foto = {
      productos: 10,
      productosConUmbral: 5,
      proveedores: 1,
      invitaciones: 1,
      whatsappVerificado: true,
    };
    const calculado = calcularChecklist(leerOnboarding(USER, TENANT, mem.persistencia), foto);
    expect(calculado.listos).toBe(calculado.total);
    expect(calculado.oculta).toBe(false);

    accionChecklist(USER, TENANT, "ocultar", undefined, mem.persistencia);
    const oculto = calcularChecklist(leerOnboarding(USER, TENANT, mem.persistencia), foto);
    expect(oculto.oculta).toBe(true);
  });
});
