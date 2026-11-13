import { describe, expect, it } from "vitest";
import {
  MAX_SUGERENCIAS_BUSCAR,
  destinosBuscar,
  filtrarDestinosBuscar,
} from "../src/lib/panel-buscar.js";

describe("TB-158 buscador del panel", () => {
  it("incluye la barra y Más sin /panel/clientes ni importar sin permiso", () => {
    const dueno = destinosBuscar("dueno", []);
    const hrefs = dueno.map((d) => d.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/panel", "/venta", "/panel/stock/importar"]));
    expect(hrefs).not.toContain("/panel/clientes");
    const empleado = destinosBuscar("empleado", ["registrar_devoluciones"]);
    expect(empleado.map((d) => d.href)).not.toContain("/panel/ventas-pendientes");
    expect(empleado.map((d) => d.href)).not.toContain("/panel/stock/importar");
  });

  it("el empleado con crear_productos sí ve importar", () => {
    const hrefs = destinosBuscar("empleado", ["crear_productos"]).map((d) => d.href);
    expect(hrefs).toContain("/panel/stock/importar");
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
