import { describe, expect, it } from "vitest";
import { derivarProximaAccion } from "../src/modules/stock/proxima-accion.js";

const base = {
  totalPrecioPendiente: 0,
  totalStockInicialPendiente: 0,
  sugeridoVigente: false,
  puedeCrearProductos: true,
  avisoMinimo: false,
};

describe("STOCK-R5: próxima acción por estado del negocio", () => {
  it("el precio pendiente gana y el indicador cuenta los pasos disponibles", () => {
    const r = derivarProximaAccion({
      ...base,
      totalPrecioPendiente: 2,
      totalStockInicialPendiente: 1,
      sugeridoVigente: true,
    });
    expect(r.tipo).toBe("precio");
    expect(r.quedan).toBe(4);
    expect(r.pasos.map((p) => p.tipo)).toEqual(["precio", "stock_inicial", "sugerido"]);
    expect(r.indice).toBe(1);
    expect(r.mostrarIndicador).toBe(true);
  });

  it("el stock inicial gana cuando no hay precios pendientes", () => {
    const r = derivarProximaAccion({ ...base, totalStockInicialPendiente: 3, sugeridoVigente: true });
    expect(r.tipo).toBe("stock_inicial");
    expect(r.quedan).toBe(4);
    expect(r.indice).toBe(1);
    expect(r.pasos.map((p) => p.tipo)).toEqual(["stock_inicial", "sugerido"]);
  });

  it("el sugerido gana cuando es lo único disponible y oculta el indicador", () => {
    const r = derivarProximaAccion({ ...base, sugeridoVigente: true });
    expect(r.tipo).toBe("sugerido");
    expect(r.quedan).toBe(1);
    expect(r.pasos.map((p) => p.tipo)).toEqual(["sugerido"]);
    expect(r.indice).toBe(1);
    expect(r.mostrarIndicador).toBe(false);
  });

  it("sin permiso para crear, el sugerido se omite sin dejar hueco", () => {
    const r = derivarProximaAccion({
      ...base,
      totalStockInicialPendiente: 1,
      sugeridoVigente: true,
      puedeCrearProductos: false,
    });
    expect(r.tipo).toBe("stock_inicial");
    expect(r.quedan).toBe(1);
    expect(r.pasos.map((p) => p.tipo)).toEqual(["stock_inicial"]);
    expect(r.mostrarIndicador).toBe(false);
  });

  it("sin permiso y sin cargas, no queda nada aunque el sugerido siga vigente", () => {
    const r = derivarProximaAccion({ ...base, sugeridoVigente: true, puedeCrearProductos: false });
    expect(r.tipo).toBe("todo_al_dia");
    expect(r.quedan).toBe(0);
    expect(r.pasos).toEqual([]);
  });

  it("el aviso de mínimo nunca gana ni bloquea", () => {
    const conPendiente = derivarProximaAccion({ ...base, totalPrecioPendiente: 1, avisoMinimo: true });
    expect(conPendiente.tipo).toBe("precio");
    const sinPendiente = derivarProximaAccion({ ...base, avisoMinimo: true });
    expect(sinPendiente.tipo).toBe("todo_al_dia");
    expect(sinPendiente.avisoMinimo).toBe(true);
    expect(sinPendiente.quedan).toBe(0);
  });
});
