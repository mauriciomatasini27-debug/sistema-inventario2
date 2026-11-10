import { describe, expect, it } from "vitest";
import {
  derivarEstado,
  esModuloPanel,
  etiquetaModulo,
  formatearCentavos,
  hrefModulo,
  montoParaInput,
  pillsPanel,
  textoVentasPendientes,
  tienePantalla,
} from "../src/lib/panel-modulos.js";

describe("panel-modulos: navegación de pills", () => {
  it("los módulos resuelven a una pantalla real, sin anclas muertas", () => {
    expect(hrefModulo("caja")).toBe("/panel/caja");
    expect(hrefModulo("stock")).toBe("/panel/stock");
    expect(hrefModulo("precios")).toBe("/panel/precios");
    expect(hrefModulo("proveedores")).toBe("/panel/proveedores");
    expect(hrefModulo("consumos")).toBe("/panel/consumos");
    expect(hrefModulo("fiado")).toBe("/panel/fiado");
    expect(hrefModulo("devoluciones")).toBe("/panel/devoluciones");
    expect(hrefModulo("reportes")).toBe("/panel/reportes");
    expect(tienePantalla("caja")).toBe(true);
    expect(tienePantalla("precios")).toBe(true);
    expect(tienePantalla("fiado")).toBe(true);
    expect(tienePantalla("devoluciones")).toBe(true);
  });

  it("todos los módulos conocidos tienen pantalla", () => {
    for (const m of ["caja", "stock", "precios", "proveedores", "consumos", "fiado", "devoluciones", "reportes"] as const) {
      expect(tienePantalla(m), m).toBe(true);
      expect(hrefModulo(m), m).toBe(`/panel/${m}`);
    }
  });

  it("pillsPanel marca un solo activo y ningún href es un ancla #", () => {
    const pills = pillsPanel("stock");
    expect(pills.map((p) => p.label)).toEqual([
      "Dashboard",
      "Ventas",
      "Devolución",
      "Caja",
      "Stock",
      "Precios",
      "Proveedores",
      "Consumos",
      "Fiado",
      "Reportes",
      "Bot",
      "Alertas",
    ]);
    expect(pills.filter((p) => p.activo).map((p) => p.label)).toEqual(["Stock"]);
    expect(pills.some((p) => p.href.startsWith("#"))).toBe(false);
  });

  it("pillsPanel sin activo conocido no rompe", () => {
    const pills = pillsPanel();
    expect(pills).toHaveLength(12);
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
    expect(etiquetaModulo("devoluciones")).toBe("Devolución");
    expect(esModuloPanel("devoluciones")).toBe(true);
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

  it("convierte centavos al valor del input de monto", () => {
    expect(montoParaInput(null)).toBe("");
    expect(montoParaInput(0)).toBe("0,00");
    expect(montoParaInput(123450)).toBe("1234,50");
    expect(montoParaInput("123450")).toBe("1234,50");
  });

  it("deriva el estado en orden cargando > error > vacío > listo", () => {
    expect(derivarEstado({ cargando: true, error: false, items: 0 })).toBe("cargando");
    expect(derivarEstado({ cargando: true, error: true, items: 5 })).toBe("cargando");
    expect(derivarEstado({ cargando: false, error: true, items: 0 })).toBe("error");
    expect(derivarEstado({ cargando: false, error: false, items: 0 })).toBe("vacio");
    expect(derivarEstado({ cargando: false, error: false, items: 3 })).toBe("listo");
  });
});

describe("textoVentasPendientes", () => {
  it("singular, plural y cero", () => {
    expect(textoVentasPendientes(0)).toBe("Sin ventas pendientes");
    expect(textoVentasPendientes(1)).toBe("1 venta pendiente de revisar");
    expect(textoVentasPendientes(2)).toBe("2 ventas pendientes de revisar");
    expect(textoVentasPendientes(37)).toBe("37 ventas pendientes de revisar");
  });

  it("no inventa texto para valores inválidos", () => {
    expect(textoVentasPendientes(-1)).toBe("");
    expect(textoVentasPendientes(1.5)).toBe("");
    expect(textoVentasPendientes(Number.NaN)).toBe("");
    expect(textoVentasPendientes(Number.POSITIVE_INFINITY)).toBe("");
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
