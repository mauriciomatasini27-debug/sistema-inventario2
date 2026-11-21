import { describe, expect, it } from "vitest";
import { destinoSi, PASOS_WIZARD, transicionConSalida } from "../src/modules/onboarding/wizard.js";

function destino(key: string, respuesta: string): string | null {
  const paso = PASOS_WIZARD.find((p) => p.key === key);
  return destinoSi(paso, respuesta);
}

describe("TB-165: ramas «sí» del cuestionario", () => {
  it("productos con «Sí» sale a importar, con «Más tarde» no", () => {
    expect(destino("productos", "Sí, cargar productos")).toBe("/panel/stock/importar");
    expect(destino("productos", "Más tarde")).toBeNull();
  });

  it("caja con «Sí» sale a la caja, con «Empezar en 0» no", () => {
    expect(destino("caja", "Sí, cargar monto")).toBe("/panel/caja");
    expect(destino("caja", "Empezar en 0")).toBeNull();
  });

  it("la rama «sí» devuelve el estado avanzado antes del destino", () => {
    const paso = PASOS_WIZARD.find((p) => p.key === "productos");
    const estado = {
      paso: 1,
      pasos: [PASOS_WIZARD[0]!, paso!],
      datosConocidos: {},
      respuestas: {
        empleados: "No, trabajo solo",
        rubro: "kiosco",
        whatsapp: "5491112345678",
      },
      empleados: [],
      empleadosDone: false,
      saltados: [],
      completado: false,
    };
    const t = transicionConSalida(estado, "Sí, cargar productos");
    expect(t.salida).toBe("/panel/stock/importar");
    expect(t.state.respuestas.productos).toBe("Sí, cargar productos");
    expect(t.state.paso).toBe(2);
  });

  it("un paso sin salida definida nunca navega", () => {
    expect(destino("empleados", "Sí, tengo empleados")).toBeNull();
  });
});
