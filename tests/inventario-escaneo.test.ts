import { describe, expect, it } from "vitest";
import {
  METODOS_IDENTIFICACION,
  normalizarCodigoEscaneado,
  puedeCrearProductos,
  siguienteMetodo,
} from "../src/modules/inventario/escaneo.js";
import { puedeCrearProductos as puedeCrearDesdePanel } from "../src/lib/panel-modulos.js";

describe("P3-1 CAT-S2 escaneo puro", () => {
  it("orden de metodos de identificacion", () => {
    expect([...METODOS_IDENTIFICACION]).toEqual(["hid", "camara", "texto", "foto"]);
  });
  it("siguienteMetodo avanza y termina en null", () => {
    expect(siguienteMetodo(null)).toBe("hid");
    expect(siguienteMetodo("hid")).toBe("camara");
    expect(siguienteMetodo("camara")).toBe("texto");
    expect(siguienteMetodo("texto")).toBe("foto");
    expect(siguienteMetodo("foto")).toBe(null);
  });
  it("normaliza codigo escaneado", () => {
    expect(normalizarCodigoEscaneado("  abc-1 ")).toBe("ABC-1");
  });
  it("spec 433 T0: una sola decision de alta compartida por UI y API", () => {
    expect(puedeCrearDesdePanel).toBe(puedeCrearProductos);

    const casos: Array<{ rol: "dueno" | "empleado"; permisos: readonly string[]; esperado: boolean }> = [
      { rol: "dueno", permisos: [], esperado: true },
      { rol: "dueno", permisos: ["crear_productos"], esperado: true },
      { rol: "empleado", permisos: [], esperado: false },
      { rol: "empleado", permisos: ["registrar_devoluciones"], esperado: false },
      { rol: "empleado", permisos: ["crear_productos"], esperado: true },
      { rol: "empleado", permisos: ["ver_saldos_caja"], esperado: false },
    ];

    for (const { rol, permisos, esperado } of casos) {
      expect(puedeCrearProductos(rol, permisos)).toBe(esperado);
    }
  });
});
