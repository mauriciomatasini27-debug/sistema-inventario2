import { describe, expect, it } from "vitest";
import { PERMISOS_EMPLEADO_DEFAULT } from "../src/modules/auth/modelo.js";
import {
  MAX_SUGERENCIAS_BUSCAR,
  destinosBuscar,
  filtrarDestinosBuscar,
} from "../src/lib/panel-buscar.js";

describe("TB-158 buscador del panel", () => {
  it("incluye la barra y Más sin /panel/clientes; importar visible para dueño y empleado", () => {
    const dueno = destinosBuscar("dueno", []);
    const hrefs = dueno.map((d) => d.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/panel", "/venta", "/panel/stock/importar"]));
    expect(hrefs).not.toContain("/panel/clientes");
    const empleado = destinosBuscar("empleado", [...PERMISOS_EMPLEADO_DEFAULT]);
    expect(empleado.map((d) => d.href)).not.toContain("/panel/ventas-pendientes");
    expect(empleado.map((d) => d.href)).toContain("/panel/stock/importar");
  });

  it("spec 433 T2: importar no depende de crear_productos (rojo si vuelve el gate)", () => {
    const sinPermiso = destinosBuscar("empleado", []).map((d) => d.href);
    const conPermiso = destinosBuscar("empleado", ["crear_productos"]).map((d) => d.href);
    expect(sinPermiso).toContain("/panel/stock/importar");
    expect(conPermiso).toContain("/panel/stock/importar");
  });

  it("filtra con un tope de sugerencias", () => {
    const todos = destinosBuscar("dueno", []);
    const vacio = filtrarDestinosBuscar(todos, "");
    expect(vacio.length).toBeLessThanOrEqual(MAX_SUGERENCIAS_BUSCAR);
    const caja = filtrarDestinosBuscar(todos, "caja");
    expect(caja[0]?.href).toBe("/panel/caja");
    expect(filtrarDestinosBuscar(todos, "zzzzzz")).toEqual([]);
  });
});
