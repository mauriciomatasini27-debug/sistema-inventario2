import { describe, expect, it } from "vitest";
import {
  derivarEstado,
  esModuloPanel,
  etiquetaModulo,
  formatearCentavos,
  hrefModulo,
  pillsPanel,
  tienePantalla,
} from "../src/lib/panel-modulos.js";

describe("panel-modulos: navegación de pills", () => {
  it("resuelve pantallas reales y placeholder sin anclas muertas", () => {
    expect(hrefModulo("caja")).toBe("/panel/caja");
    expect(hrefModulo("stock")).toBe("/panel/stock");
    expect(hrefModulo("precios")).toBe("/panel/precios");
    expect(hrefModulo("proveedores")).toBe("/panel/pronto?m=proveedores");
    expect(hrefModulo("consumos")).toBe("/panel/pronto?m=consumos");
    expect(hrefModulo("fiado")).toBe("/panel/pronto?m=fiado");
    expect(hrefModulo("reportes")).toBe("/panel/pronto?m=reportes");
    expect(tienePantalla("caja")).toBe(true);
    expect(tienePantalla("precios")).toBe(true);
    expect(tienePantalla("fiado")).toBe(false);
  });

  it("pillsPanel marca un solo activo y ningún href es un ancla #", () => {
    const pills = pillsPanel("stock");
    expect(pills.map((p) => p.label)).toEqual([
      "Dashboard",
      "Ventas",
      "Caja",
      "Stock",
      "Precios",
      "Proveedores",
      "Consumos",
      "Fiado",
      "Reportes",
    ]);
    expect(pills.filter((p) => p.activo).map((p) => p.label)).toEqual(["Stock"]);
    expect(pills.some((p) => p.href.startsWith("#"))).toBe(false);
  });

  it("pillsPanel sin activo conocido no rompe", () => {
    const pills = pillsPanel();
    expect(pills).toHaveLength(9);
    expect(pills.some((p) => p.activo)).toBe(false);
  });

  it("esModuloPanel y etiquetaModulo acotan los módulos conocidos", () => {
    expect(esModuloPanel("caja")).toBe(true);
    expect(esModuloPanel("reportes")).toBe(true);
    expect(esModuloPanel("inventado")).toBe(false);
    expect(esModuloPanel(null)).toBe(false);
    expect(esModuloPanel("")).toBe(false);
    expect(etiquetaModulo("proveedores")).toBe("Proveedores");
    expect(etiquetaModulo("stock")).toBe("Stock");
  });
});

describe("panel-modulos: formato y estado de widgets", () => {
  it("formatea centavos como lo hace el panel", () => {
    expect(formatearCentavos(15000)).toBe("$150.00");
    expect(formatearCentavos(0)).toBe("$0.00");
    expect(formatearCentavos(123456789)).toBe("$1234567.89");
    expect(formatearCentavos("4800000")).toBe("$48000.00");
    expect(formatearCentavos(1500n)).toBe("$15.00");
    expect(formatearCentavos(-250)).toBe("-$2.50");
    expect(formatearCentavos(Number.NaN)).toBe("$0.00");
  });

  it("deriva el estado en orden cargando > error > vacío > listo", () => {
    expect(derivarEstado({ cargando: true, error: false, items: 0 })).toBe("cargando");
    expect(derivarEstado({ cargando: true, error: true, items: 5 })).toBe("cargando");
    expect(derivarEstado({ cargando: false, error: true, items: 0 })).toBe("error");
    expect(derivarEstado({ cargando: false, error: false, items: 0 })).toBe("vacio");
    expect(derivarEstado({ cargando: false, error: false, items: 3 })).toBe("listo");
  });
});

describe("textoError", () => {
  it("texto, flatten de zod y fallback", async () => {
    const { textoError } = await import("../src/lib/panel-modulos.js");
    expect(textoError("duplicado", 409)).toBe("duplicado");
    expect(textoError({ formErrors: [], fieldErrors: { cantidad: ["x"] } }, 422)).toBe("revisá cantidad");
    expect(textoError(undefined, 500)).toBe("error 500");
  });
});
