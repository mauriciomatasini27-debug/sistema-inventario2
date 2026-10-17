import { describe, expect, it } from "vitest";
import { fechaAR } from "../src/lib/fecha-ar.js";
import { PLANES_EJEMPLO } from "../src/modules/planes/catalogo.js";
import { CUPO_ASISTENTE_POR_DEFECTO } from "../src/modules/ia/asistente.js";
import { ETIQUETAS_FEATURE, ORDEN_FEATURES, vistaPlan } from "../src/lib/plan-panel.js";

const hoy = fechaAR(Date.parse("2026-10-17T12:00:00Z"));

function vista(planId: "basico" | "plus" | "pro" | null, usado: number) {
  return vistaPlan({ planId, catalogo: PLANES_EJEMPLO, consultasAsistenteMes: usado, hoy });
}

describe("plan-panel: cupo efectivo del asistente", () => {
  it("el tope por defecto es el mismo que usa crearAsistente", () => {
    expect(CUPO_ASISTENTE_POR_DEFECTO).toBe(100);
  });

  it("Plus incluye el asistente con cupo null y usa el tope por defecto", () => {
    const v = vista("plus", 37);
    expect(v.plan_id).toBe("plus");
    expect(v.nombre).toBe("Plus");
    expect(v.es_catalogo_ejemplo).toBe(true);
    expect(v.asistente).toMatchObject({
      incluido: true,
      usado: 37,
      cupo: CUPO_ASISTENTE_POR_DEFECTO,
      restante: 63,
      agotado: false,
      porcentaje: 37,
      reinicia_el: "2026-11-01",
    });
  });

  it("agotado cuando usado llega al cupo, restante 0 y porcentaje 100", () => {
    const v = vista("pro", CUPO_ASISTENTE_POR_DEFECTO);
    expect(v.asistente.agotado).toBe(true);
    expect(v.asistente.restante).toBe(0);
    expect(v.asistente.porcentaje).toBe(100);
    expect(v.asistente.explicacion).toContain("Llegaste al cupo del mes");
    expect(v.asistente.explicacion).toContain("1/11");
  });

  it("usado por encima del cupo: restante nunca negativo y porcentaje tope 100", () => {
    const v = vista("plus", CUPO_ASISTENTE_POR_DEFECTO + 25);
    expect(v.asistente.usado).toBe(125);
    expect(v.asistente.restante).toBe(0);
    expect(v.asistente.agotado).toBe(true);
    expect(v.asistente.porcentaje).toBe(100);
  });

  it("porcentaje redondea a entero", () => {
    const catalogo = PLANES_EJEMPLO.map((p) =>
      p.id === "plus" ? { ...p, cupos: { ...p.cupos, asistente_ia: 3 } } : p,
    );
    const v = vistaPlan({ planId: "plus", catalogo, consultasAsistenteMes: 1, hoy });
    expect(v.asistente.cupo).toBe(3);
    expect(v.asistente.porcentaje).toBe(33);
  });

  it("un cupo numérico del plan pisa el tope por defecto", () => {
    const catalogo = PLANES_EJEMPLO.map((p) =>
      p.id === "plus" ? { ...p, cupos: { ...p.cupos, asistente_ia: 50 } } : p,
    );
    const v = vistaPlan({ planId: "plus", catalogo, consultasAsistenteMes: 10, hoy });
    expect(v.asistente.cupo).toBe(50);
    expect(v.asistente.restante).toBe(40);
  });

  it("sin plan activo: nombre, no incluido y explicación", () => {
    const v = vista(null, 0);
    expect(v.plan_id).toBeNull();
    expect(v.nombre).toBe("Sin plan activo");
    expect(v.es_catalogo_ejemplo).toBe(false);
    expect(v.asistente.incluido).toBe(false);
    expect(v.asistente.cupo).toBe(0);
    expect(v.asistente.explicacion).toContain("Sin plan activo");
  });

  it("plan que no incluye el asistente: incluido false y explicación con el plan", () => {
    const v = vista("basico", 0);
    expect(v.nombre).toBe("Básico");
    expect(v.asistente.incluido).toBe(false);
    expect(v.asistente.cupo).toBe(0);
    expect(v.asistente.explicacion).toContain("Básico");
    expect(v.asistente.explicacion).toContain("no incluye");
  });
});

describe("plan-panel: features legibles", () => {
  it("lista todas las features del catálogo con etiqueta en español", () => {
    const v = vista("plus", 0);
    expect(v.features.map((f) => f.clave)).toEqual([...ORDEN_FEATURES]);
    for (const f of v.features) {
      expect(f.etiqueta, f.clave).toBe(ETIQUETAS_FEATURE[f.clave]);
      expect(f.etiqueta.length, f.clave).toBeGreaterThan(0);
    }
  });

  it("Básico no incluye asistente_ia pero sí nucleo; Plus incluye asistente_ia", () => {
    const basico = vista("basico", 0);
    expect(basico.features.find((f) => f.clave === "asistente_ia")?.incluida).toBe(false);
    expect(basico.features.find((f) => f.clave === "nucleo")?.incluida).toBe(true);
    const plus = vista("plus", 0);
    expect(plus.features.find((f) => f.clave === "asistente_ia")?.incluida).toBe(true);
  });
});

describe("plan-panel: reinicio de mes en hora Argentina", () => {
  it("reinicia el día 1 del mes siguiente", () => {
    expect(vistaPlan({ planId: "plus", catalogo: PLANES_EJEMPLO, consultasAsistenteMes: 0, hoy: fechaAR(Date.parse("2026-10-01T12:00:00Z")) }).asistente.reinicia_el).toBe("2026-11-01");
    expect(vistaPlan({ planId: "plus", catalogo: PLANES_EJEMPLO, consultasAsistenteMes: 0, hoy: fechaAR(Date.parse("2026-10-31T12:00:00Z")) }).asistente.reinicia_el).toBe("2026-11-01");
  });

  it("cruza el año desde diciembre", () => {
    const v = vistaPlan({ planId: "plus", catalogo: PLANES_EJEMPLO, consultasAsistenteMes: 0, hoy: fechaAR(Date.parse("2026-12-15T12:00:00Z")) });
    expect(v.asistente.reinicia_el).toBe("2027-01-01");
  });
});
