import { describe, expect, it } from "vitest";
import {
  CUIT,
  EMAIL,
  FECHA,
  MONTO,
  PORCENTAJE,
  REQUERIDO,
  TELEFONO,
  enteroMin,
  erroresDesdeZod,
  etiquetaDe,
  mensajeCampo,
  reglaDeCampo,
} from "../src/lib/errores-campo.js";

describe("errores-campo: catálogo de mensajes que dicen cómo arreglar", () => {
  it("requerido nombra el campo y pide ponerlo", () => {
    expect(mensajeCampo("cuit", REQUERIDO)).toBe("Poné el CUIT.");
    expect(mensajeCampo("nombre_comercio", REQUERIDO)).toBe("Poné el nombre del comercio.");
    expect(mensajeCampo("campo_raro", REQUERIDO)).toBe("Poné campo raro.");
  });

  it("entero_min pide un entero con el mínimo exacto", () => {
    expect(mensajeCampo("cantidad", enteroMin(1))).toBe("Poné un número entero de 1 para arriba.");
    expect(mensajeCampo("costo_centavos", enteroMin(0))).toBe("Poné un número entero desde 0.");
    expect(mensajeCampo("min_stock", enteroMin(3))).toBe("Poné un número entero de 3 para arriba.");
  });

  it("cada regla nombrada dice cómo arreglar", () => {
    expect(mensajeCampo("cuit", CUIT)).toBe("Escribí el CUIT con 11 dígitos, sin guiones ni espacios.");
    expect(mensajeCampo("email", EMAIL)).toBe("Escribí un email válido, con arroba y dominio.");
    expect(mensajeCampo("telefono", TELEFONO)).toBe("Escribí el celular con código de área, por ejemplo 11 5555-1234.");
    expect(mensajeCampo("monto_centavos", MONTO)).toBe("Poné un monto mayor a 0.");
    expect(mensajeCampo("porcentaje", PORCENTAJE)).toBe("Poné un porcentaje mayor a 0, por ejemplo 10.");
    expect(mensajeCampo("vence_el", FECHA)).toBe("Elegí una fecha válida, por ejemplo 2026-10-17.");
  });

  it("ningún mensaje es solo 'inválido'", () => {
    const mensajes = [
      mensajeCampo("cuit", REQUERIDO),
      mensajeCampo("cuit", CUIT),
      mensajeCampo("email", EMAIL),
      mensajeCampo("telefono", TELEFONO),
      mensajeCampo("monto_centavos", MONTO),
      mensajeCampo("porcentaje", PORCENTAJE),
      mensajeCampo("vence_el", FECHA),
      mensajeCampo("cantidad", enteroMin(1)),
    ];
    for (const m of mensajes) {
      expect(m).not.toMatch(/inválid/i);
      expect(m.length).toBeGreaterThan(6);
    }
  });
});

describe("errores-campo: regla por campo y mensaje de zod", () => {
  it("etiquetaDe arma el nombre legible del campo", () => {
    expect(etiquetaDe("cuit")).toBe("el CUIT");
    expect(etiquetaDe("supplier_cuit")).toBe("el CUIT");
    expect(etiquetaDe("nombre_comercio")).toBe("el nombre del comercio");
    expect(etiquetaDe("campo_raro")).toBe("campo raro");
  });

  it("elige la regla por el nombre del campo", () => {
    expect(reglaDeCampo("cuit")).toEqual({ tipo: "cuit" });
    expect(reglaDeCampo("email")).toEqual({ tipo: "email" });
    expect(reglaDeCampo("telefono")).toEqual({ tipo: "telefono" });
    expect(reglaDeCampo("monto_centavos")).toEqual({ tipo: "monto" });
    expect(reglaDeCampo("porcentaje")).toEqual({ tipo: "porcentaje" });
    expect(reglaDeCampo("vence_el")).toEqual({ tipo: "fecha" });
  });

  it("usa el mensaje de zod para faltantes, mínimos y email", () => {
    expect(reglaDeCampo("nombre", "Invalid input: expected string, received undefined")).toEqual({ tipo: "requerido" });
    expect(reglaDeCampo("qty", "Too small: expected number to be >=1")).toEqual({ tipo: "entero_min", min: 1 });
    expect(reglaDeCampo("sku", "Too small: expected string to have >=1 characters")).toEqual({ tipo: "requerido" });
    expect(reglaDeCampo("contacto", "Invalid email address")).toEqual({ tipo: "email" });
  });

  it("devuelve null para un campo desconocido sin pistas", () => {
    expect(reglaDeCampo("fantasma")).toBeNull();
  });
});

describe("errores-campo: body 422 de zod a mensajes por campo", () => {
  it("mapea fieldErrors con el catálogo", () => {
    const body = {
      error: {
        formErrors: [],
        fieldErrors: {
          cuit: ["Too small: expected string to have >=11 characters"],
          email: ["Invalid email address"],
          nombre: ["Invalid input: expected string, received undefined"],
          monto_centavos: ["Too small: expected number to be >0"],
        },
      },
    };
    expect(erroresDesdeZod(body)).toEqual({
      cuit: "Escribí el CUIT con 11 dígitos, sin guiones ni espacios.",
      email: "Escribí un email válido, con arroba y dominio.",
      nombre: "Poné el nombre.",
      monto_centavos: "Poné un monto mayor a 0.",
    });
  });

  it("cae a 'Revisá <etiqueta>' cuando el campo no tiene regla", () => {
    const body = { error: { fieldErrors: { fantasma: ["algo raro"] } } };
    expect(erroresDesdeZod(body, { fantasma: "el campo raro" })).toEqual({ fantasma: "Revisá el campo raro." });
    expect(erroresDesdeZod(body)).toEqual({ fantasma: "Revisá fantasma." });
  });

  it("tolera cuerpos sin fieldErrors o que no son objetos", () => {
    expect(erroresDesdeZod({ error: "texto" })).toEqual({});
    expect(erroresDesdeZod({ error: { formErrors: ["boom"] } })).toEqual({});
    expect(erroresDesdeZod(null)).toEqual({});
    expect(erroresDesdeZod(undefined)).toEqual({});
  });
});
