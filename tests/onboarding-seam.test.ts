import { describe, expect, it } from "vitest";
import {
  crearPersistenciaOnboardingMemoria,
} from "../src/modules/onboarding/persistencia.js";
import {
  accionChecklist,
  calcularChecklist,
  completarWizard,
  completarWizardConRespuestas,
  leerOnboarding,
  marcarTourPaso,
  registrarVideo,
  type ContextoOnboarding,
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

// TB-165 [tenant]: el módulo recibe un único contexto con quién, dónde y dónde guardar.
function ctx(
  mem: ReturnType<typeof seam>,
  tenantId = TENANT,
): ContextoOnboarding {
  return { userId: USER, tenantId, persistencia: mem.persistencia };
}

describe("onboarding seam — PersistenciaOnboarding", () => {
  it("leer devuelve el estado inicial sin escribir", () => {
    const mem = seam();
    const estado = leerOnboarding(ctx(mem));

    expect(estado.userId).toBe(USER);
    expect(estado.tenantId).toBe(TENANT);
    expect(estado.tourEstado).toBe("no_iniciado");
    expect(estado.wizardCompletado).toBe(false);
    expect(mem.estados.has(CLAVE)).toBe(false);
  });

  it("marcarTourPaso persiste avance y estado del tour", () => {
    const mem = seam();
    marcarTourPaso(ctx(mem), 3, "en_curso");

    const guardado = mem.estados.get(CLAVE);
    expect(guardado?.tourUltimoPaso).toBe(3);
    expect(guardado?.tourEstado).toBe("en_curso");
  });

  it("accionChecklist acumula pasos saltados y retomar los quita", () => {
    const mem = seam();
    accionChecklist(ctx(mem), "saltar", "whatsapp");
    accionChecklist(ctx(mem), "saltar", "productos");
    accionChecklist(ctx(mem), "saltar", "productos");
    expect(mem.estados.get(CLAVE)?.pasosSaltados).toEqual(["whatsapp", "productos"]);

    accionChecklist(ctx(mem), "retomar", "whatsapp");
    expect(mem.estados.get(CLAVE)?.pasosSaltados).toEqual(["productos"]);
  });

  it("ocultar/mostrar cambian checklistOculta sin tocar los saltados", () => {
    const mem = seam();
    accionChecklist(ctx(mem), "saltar", "productos");
    accionChecklist(ctx(mem), "ocultar", undefined);
    expect(mem.estados.get(CLAVE)?.checklistOculta).toBe(true);
    expect(mem.estados.get(CLAVE)?.pasosSaltados).toEqual(["productos"]);

    accionChecklist(ctx(mem), "mostrar", undefined);
    expect(mem.estados.get(CLAVE)?.checklistOculta).toBe(false);
  });

  it("registrarVideo actualiza progreso y marca visto al terminar", () => {
    const mem = seam();
    registrarVideo(ctx(mem), 50, "mitad");
    expect(mem.estados.get(CLAVE)?.videoProgreso).toBe(50);
    expect(mem.estados.get(CLAVE)?.videoVisto).toBe(false);

    registrarVideo(ctx(mem), 100, "fin");
    expect(mem.estados.get(CLAVE)?.videoProgreso).toBe(100);
    expect(mem.estados.get(CLAVE)?.videoVisto).toBe(true);
  });

  it("completarWizard puentea WizardState a OnboardingState", () => {
    const mem = seam();
    let wizard = estadoInicialWizard();
    wizard = agregarEmpleado(wizard, "Ana");
    wizard = agregarEmpleado(wizard, "Beto");
    wizard = marcarCompletado({ ...wizard, paso: wizard.pasos.length });
    const actualizado = completarWizard(ctx(mem), wizard);

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
    const actualizado = completarWizard(ctx(mem), wizard);

    expect(actualizado.wizardRespuestas).toEqual({
      empleados: "Sí, tengo empleados",
      productos: "Sí, cargar productos",
      caja: "Empezar en 0",
    });
    expect(mem.estados.get(CLAVE)?.wizardRespuestas.caja).toBe("Empezar en 0");
  });

  it("el mismo usuario en otro comercio tiene estado independiente", () => {
    const mem = seam();
    marcarTourPaso(ctx(mem), 7, "completado");
    const otro = leerOnboarding(ctx(mem, "t-2"));

    expect(otro.tourUltimoPaso).toBe(0);
    expect(otro.tenantId).toBe("t-2");
    expect(mem.estados.size).toBe(1);
  });

  it("completarWizardConRespuestas puentea desde la ruta sin armar un WizardState", () => {
    const mem = seam();
    const next = completarWizardConRespuestas(ctx(mem), undefined, ["Ana"]);

    expect(next.wizardCompletado).toBe(true);
    expect(next.wizardPaso).toBe(estadoInicialWizard().pasos.length);
    expect(next.wizardEmpleados).toEqual(["Ana"]);

    // TB-165: sin empleados en el body conserva los ya persistidos
    const otra = completarWizardConRespuestas(ctx(mem), undefined, undefined);
    expect(otra.wizardEmpleados).toEqual(["Ana"]);
  });

  it("TB-165: saltar empleado lo marca no aplica y lo saca del progreso", () => {
    const mem = seam();
    accionChecklist(ctx(mem), "saltar", "empleado");
    const foto = {
      productos: 0,
      productosConUmbral: 0,
      proveedores: 0,
      invitaciones: 0,
      whatsappVerificado: true,
    };
    const calculado = calcularChecklist(leerOnboarding(ctx(mem)), foto);
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
    const calculado = calcularChecklist(leerOnboarding(ctx(mem)), foto);
    expect(calculado.listos).toBe(calculado.total);
    expect(calculado.oculta).toBe(false);

    accionChecklist(ctx(mem), "ocultar", undefined);
    const oculto = calcularChecklist(leerOnboarding(ctx(mem)), foto);
    expect(oculto.oculta).toBe(true);
  });
});
