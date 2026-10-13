import { describe, expect, it } from "vitest";
import { pasos_para_rol, PASOS_DUENO, PASOS_EMPLEADO } from "../src/modules/onboarding/tour.js";
import { calcular_checklist } from "../src/modules/onboarding/checklist.js";

describe("tour y checklist ON7 ON8", () => {
  it("dueño ve 11 pasos y empleado 6 sin caja", () => {
    expect(PASOS_DUENO).toHaveLength(11);
    expect(PASOS_EMPLEADO).toHaveLength(6);
    const emp = pasos_para_rol("empleado", []);
    expect(emp.some((p) => p.ancla.startsWith("caja"))).toBe(false);
    expect(emp.some((p) => p.ancla.startsWith("proveedores"))).toBe(false);
  });

  it("checklist cuenta 4 de 10 y se tilda a los 10", () => {
    const parcial = calcular_checklist({
      productos: 4,
      productosConUmbral: 4,
      proveedores: 0,
      invitaciones: 0,
      whatsappVerificado: true,
    });
    expect(parcial.pasos[0]?.contador).toBe("4 de 10");
    expect(parcial.pasos[0]?.listo).toBe(false);
    const full = calcular_checklist({
      productos: 10,
      productosConUmbral: 5,
      proveedores: 1,
      invitaciones: 1,
      whatsappVerificado: true,
    });
    expect(full.listos).toBe(4);
  });

  it("whatsapp pendiente va primero y ejemplo no cuenta", () => {
    const pendiente = calcular_checklist({
      productos: 10,
      productosConUmbral: 5,
      proveedores: 1,
      invitaciones: 1,
      whatsappVerificado: false,
    });
    expect(pendiente.pasos[0]?.id).toBe("whatsapp");
    const ejemplo = calcular_checklist({
      productos: 50,
      productosConUmbral: 50,
      proveedores: 3,
      invitaciones: 2,
      whatsappVerificado: true,
      esEjemplo: true,
    });
    expect(ejemplo.total).toBe(0);
  });
});
