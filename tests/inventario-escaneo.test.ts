import { describe, expect, it } from "vitest";
import {
  METODOS_IDENTIFICACION,
  estadoAltaDesdeRol,
  normalizarCodigoEscaneado,
  siguienteMetodo,
} from "../src/modules/inventario/escaneo.js";

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
  it("estado de alta segun rol y permisos", () => {
    expect(estadoAltaDesdeRol("dueno", [])).toBe("activo");
    expect(estadoAltaDesdeRol("empleado", [])).toBe("pendiente_revision");
    expect(estadoAltaDesdeRol("empleado", ["crear_productos"])).toBe("activo");
    expect(estadoAltaDesdeRol("empleado", ["ver_saldos_caja"])).toBe("pendiente_revision");
  });
});
