import { describe, expect, it } from "vitest";
import { filtrarTexto, listaQuerySchema, paginar } from "../src/lib/lista-paginada.js";

describe("lista-paginada: filtro y offset puros de los listados del panel", () => {
  const filas = [
    { nombre: "Distribuidora Sur", cuit: "20933331726" },
    { nombre: "Almacen Norte", cuit: "30712345671" },
    { nombre: "Distribuidora Centro", cuit: "20111111112" },
  ];

  it("filtrarTexto ignora mayúsculas y espacios de sobra", () => {
    expect(filtrarTexto(filas, "  SUR  ", (f) => [f.nombre, f.cuit])).toEqual([filas[0]]);
    expect(filtrarTexto(filas, "almacen", (f) => [f.nombre])).toEqual([filas[1]]);
    expect(filtrarTexto(filas, "11111112", (f) => [f.cuit])).toEqual([filas[2]]);
  });

  it("filtrarTexto sin q devuelve todo, sin mutar la entrada", () => {
    const copia = [...filas];
    expect(filtrarTexto(filas, "", (f) => [f.nombre])).toEqual(filas);
    expect(filas).toEqual(copia);
  });

  it("filtrarTexto tolera campos nulos", () => {
    const conNulos = [{ nombre: "Sur", telefono: null }, { nombre: "Norte", telefono: undefined }];
    expect(filtrarTexto(conNulos, "norte", (f) => [f.nombre, f.telefono])).toEqual([conNulos[1]]);
  });

  it("paginar corta por offset y expone next_cursor", () => {
    const p1 = paginar(filas, { limit: 2, cursor: 0 });
    expect(p1.items).toEqual(filas.slice(0, 2));
    expect(p1.next_cursor).toBe("2");

    const p2 = paginar(filas, { limit: 2, cursor: 2 });
    expect(p2.items).toEqual(filas.slice(2));
    expect(p2.next_cursor).toBeNull();
  });

  it("paginar fuera de rango devuelve vacío y sin next_cursor", () => {
    const p = paginar(filas, { limit: 2, cursor: 10 });
    expect(p.items).toEqual([]);
    expect(p.next_cursor).toBeNull();
  });

  it("listaQuerySchema aplica defaults y coercion a número", () => {
    const base = listaQuerySchema.safeParse({});
    expect(base.success).toBe(true);
    if (!base.success) return;
    expect(base.data).toEqual({ q: "", limit: 20, cursor: 0 });

    const conDatos = listaQuerySchema.safeParse({ q: "sur", limit: "5", cursor: "10" });
    expect(conDatos.success).toBe(true);
    if (!conDatos.success) return;
    expect(conDatos.data).toEqual({ q: "sur", limit: 5, cursor: 10 });
  });

  it("listaQuerySchema rechaza límites y cursores inválidos", () => {
    for (const malo of [{ limit: "51" }, { limit: "0" }, { limit: "x" }, { cursor: "-1" }, { cursor: "1.5" }]) {
      expect(listaQuerySchema.safeParse(malo).success).toBe(false);
    }
  });
});
