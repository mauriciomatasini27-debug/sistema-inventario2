import { describe, expect, it } from "vitest";
import {
  BARRA_TABLERO,
  ENTRADAS_MAS,
  derivarEstado,
  esModuloPanel,
  etiquetaModulo,
  formatearCentavos,
  gruposMasVisibles,
  hrefModulo,
  montoParaInput,
  pillsPanel,
  puedeCrearProductos,
  puedeVerSaldoCaja,
  rolParaNav,
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

describe("TB-158 barra y Más", () => {
  it("la barra tiene cinco accesos y Vender queda al centro, destacado", () => {
    expect(BARRA_TABLERO.map((a) => a.label)).toEqual(["Inicio", "Productos", "Vender", "Fiado", "Más"]);
    expect(BARRA_TABLERO.map((a) => a.href)).toEqual(["/panel", "/panel/stock", "/venta", "/panel/fiado", null]);
    expect(BARRA_TABLERO[2]?.destacado).toBe(true);
    expect(BARRA_TABLERO.some((a) => a.href === "/panel/clientes")).toBe(false);
  });

  it("Más agrupa Devolución bajo Vender y no inventa /panel/clientes", () => {
    const dueno = gruposMasVisibles("dueno");
    const vender = dueno.find((g) => g.id === "vender");
    expect(vender?.entradas.map((e) => e.href)).toEqual(["/panel/ventas-pendientes", "/panel/devoluciones"]);
    expect(dueno.flatMap((g) => g.entradas.map((e) => e.href))).not.toContain("/panel/clientes");
    expect(ENTRADAS_MAS.map((e) => e.href)).not.toContain("/panel/clientes");
  });

  it("el empleado no ve ventas pendientes ni Gmail; el dueño sí", () => {
    const hrefs = (rol: "dueno" | "empleado") =>
      gruposMasVisibles(rol).flatMap((g) => g.entradas.map((e) => e.href));
    expect(hrefs("dueno")).toEqual(expect.arrayContaining([
      "/panel/ventas-pendientes",
      "/panel/integraciones",
      "/panel/integraciones-remitentes",
    ]));
    expect(hrefs("empleado")).not.toEqual(expect.arrayContaining(["/panel/ventas-pendientes"]));
    expect(hrefs("empleado")).not.toContain("/panel/integraciones");
    expect(hrefs("empleado")).not.toContain("/panel/integraciones-remitentes");
    expect(hrefs("empleado")).toContain("/panel/devoluciones");
    expect(hrefs("empleado")).toContain("/panel/caja");
  });

  it("el saldo de caja y el alta de producto siguen el permiso, y el dueño los tiene", () => {
    expect(puedeVerSaldoCaja("dueno", [])).toBe(true);
    expect(puedeVerSaldoCaja("empleado", [])).toBe(false);
    expect(puedeVerSaldoCaja("empleado", ["ver_saldos_caja"])).toBe(true);
    expect(puedeVerSaldoCaja("empleado", ["crear_productos"])).toBe(false);
    expect(puedeCrearProductos("dueno", [])).toBe(true);
    expect(puedeCrearProductos("empleado", ["registrar_devoluciones"])).toBe(false);
    expect(puedeCrearProductos("empleado", ["crear_productos"])).toBe(true);
  });

  it("sin sesión el nav queda como dueño; sin permiso cierra", () => {
    expect(rolParaNav({ estado: "legado" }).rol).toBe("dueno");
    expect(rolParaNav({ estado: "sin_permiso" })).toEqual({ rol: "empleado", permisos: [] });
    expect(rolParaNav({ estado: "sesion", rol: "empleado", permisos: ["registrar_devoluciones"] })).toEqual({
      rol: "empleado",
      permisos: ["registrar_devoluciones"],
    });
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
