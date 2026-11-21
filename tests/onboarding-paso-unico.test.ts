import { describe, expect, it } from "vitest";
import {
  avanzar,
  destinoSi,
  estadoInicialWizard,
  indiceSubflujoEmpleados,
  PASOS_WIZARD,
  pasosParaDatos,
  retomar,
  saltar,
  subflujoEmpleadosActivo,
  transicionConSalida,
  type PasoWizard,
} from "../src/modules/onboarding/wizard.js";
import { ID_CHECKLIST_EMPLEADO } from "../src/modules/onboarding/checklist.js";
import { leerOnboarding } from "../src/modules/onboarding/onboarding.js";
import { crearPersistenciaOnboardingMemoria } from "../src/modules/onboarding/persistencia.js";

function paso(con: Partial<PasoWizard>): PasoWizard {
  return { key: "k", titulo: "T", tipo: "choice", ...con };
}

describe("TB-165: la semántica del paso vive en PasoWizard", () => {
  it("la salida de la rama «sí» la define el paso, no la vista", () => {
    const productos = PASOS_WIZARD.find((p) => p.key === "productos");
    expect(destinoSi(productos, "Sí, cargar productos")).toBe("/panel/stock/importar");
    expect(destinoSi(productos, "Más tarde")).toBeNull();

    const caja = PASOS_WIZARD.find((p) => p.key === "caja");
    expect(destinoSi(caja, "Sí, cargar monto")).toBe("/panel/caja");

    const generico = paso({ salidaSi: "/destino-nuevo" });
    expect(destinoSi(generico, "Sí")).toBe("/destino-nuevo");
    expect(destinoSi(paso({ key: "productos" }), "Sí")).toBeNull();
  });

  it("el subflujo de empleados se decide por metadatos, no por key", () => {
    const pasos = [paso({ key: "otro", subflujo: "empleados" })];
    let s = { ...estadoInicialWizard(), pasos };
    s = avanzar(s, "Sí, tengo empleados");
    expect(s.empleadosDone).toBe(false);
    expect(s.paso).toBe(0);
    expect(subflujoEmpleadosActivo(s)).toBe(true);

    s = avanzar(s, "No, trabajo solo");
    expect(subflujoEmpleadosActivo(s)).toBe(false);
  });

  it("«no aplica» usa el id canónico del checklist, no el key del wizard", () => {
    const empleados = PASOS_WIZARD.find((p) => p.key === "empleados");
    expect(empleados?.noAplicaId).toBe(ID_CHECKLIST_EMPLEADO);

    const datos = { rubro: "k", whatsapp: "w" };
    const s = retomar(0, { empleados: "No, trabajo solo" }, [], [], datos);
    const saltado = saltar(s);
    expect(saltado.saltados).toContain(ID_CHECKLIST_EMPLEADO);
    expect(saltado.saltados).not.toContain("empleados");
  });

  it("la transición devuelve el estado ya avanzado antes del destino", () => {
    const datos = { rubro: "k", whatsapp: "w" };
    let s = retomar(0, {}, [], [], datos);
    s = avanzar(s, "No, trabajo solo"); // ahora el paso es productos

    const conSalida = transicionConSalida(s, "Sí, cargar productos");
    expect(conSalida.salida).toBe("/panel/stock/importar");
    expect(conSalida.state.respuestas.productos).toBe("Sí, cargar productos");
    expect(conSalida.state.paso).toBe(s.paso + 1);

    const sinSalida = transicionConSalida(s, "Más tarde");
    expect(sinSalida.salida).toBeNull();
    expect(sinSalida.state.paso).toBe(s.paso + 1);
  });

  it("las firmas públicas reciben ContextoOnboarding", () => {
    const mem = crearPersistenciaOnboardingMemoria();
    const ctx = { userId: "u-contexto", tenantId: "t-contexto", persistencia: mem.persistencia };
    const estado = leerOnboarding(ctx);
    expect(estado.userId).toBe("u-contexto");
    expect(estado.tenantId).toBe("t-contexto");
  });

  it("retomar deriva el progreso del subflujo de los metadatos del paso", () => {
    const pasos = [paso({ key: "otro", subflujo: "empleados" }), paso({ key: "caja" })];
    expect(indiceSubflujoEmpleados(pasos)).toBe(0);
    expect(indiceSubflujoEmpleados([paso({ key: "empleados" })])).toBe(-1);

    const datos = { rubro: "k", whatsapp: "w" };
    expect(indiceSubflujoEmpleados(pasosParaDatos(datos))).toBe(0);
    expect(retomar(0, {}, [], [], datos).empleadosDone).toBe(false);
    expect(retomar(1, {}, [], [], datos).empleadosDone).toBe(true);
  });
});
