import { describe, expect, it } from "vitest";
import {
  cuitConDigito,
  cuitDeCorrida,
  digitoCuit,
  fechaLocal,
  itemDeLista,
  leerH1,
  leerTitulo,
  mensajeDeError,
  pasoOk,
  precioDeProducto,
  productoDeLista,
  resumir,
  skuDeProducto,
  slugSeguro,
} from "../scripts/check-navegacion-lib.mjs";

describe("cuit", () => {
  it("calcula el dígito verificador con los pesos de la RG 5616", () => {
    expect(digitoCuit("2012345678")).toBe(6);
    expect(cuitConDigito("2012345678")).toBe("20123456786");
  });

  it("cubre resto 0 (dígito 0) y resto 1 (dígito 9)", () => {
    expect(cuitConDigito("3071012345")).toBe("30710123450");
    expect(cuitConDigito("2000000001")).toBe("20000000019");
  });

  it("devuelve null si no hay 10 dígitos", () => {
    expect(digitoCuit("201234567")).toBeNull();
    expect(cuitConDigito("20-1234567")).toBeNull();
    expect(cuitConDigito("")).toBeNull();
  });

  it("genera un CUIT válido y distinto por corrida", () => {
    const a = cuitDeCorrida(1_700_000_000_000, "a");
    const b = cuitDeCorrida(1_700_000_001_000, "a");
    expect(a).toMatch(/^\d{11}$/);
    expect(b).toMatch(/^\d{11}$/);
    expect(a).not.toBe(b);
    expect(cuitConDigito((a ?? "").slice(0, 10))).toBe(a);
  });
});

describe("lectura de página", () => {
  it("extrae el h1 sin etiquetas ni espacios de más", () => {
    const html = '<section><h1 class="x">\n  Venta   <span>mostrador</span>\n</h1></section>';
    expect(leerH1(html)).toBe("Venta mostrador");
  });

  it("devuelve null si no hay h1", () => {
    expect(leerH1("<main>sin título</main>")).toBeNull();
    expect(leerH1("")).toBeNull();
  });

  it("extrae el title", () => {
    expect(leerTitulo("<head><title> Inventario </title></head>")).toBe("Inventario");
  });
});

describe("productos", () => {
  it("acepta precio camel, snake y string", () => {
    expect(precioDeProducto({ precioCentavos: 850000 })).toBe(850000);
    expect(precioDeProducto({ precio_centavos: 123400 })).toBe(123400);
    expect(precioDeProducto({ precioCentavos: "999" })).toBe(999);
    expect(precioDeProducto({})).toBeUndefined();
  });

  it("busca por sku sin importar mayúsculas", () => {
    const cuerpo = { productos: [{ sku: "CAFE-001", nombre: "Café" }] };
    expect(productoDeLista(cuerpo, "cafe-001")?.nombre).toBe("Café");
    expect(productoDeLista(cuerpo, "YERBA")).toBeNull();
    expect(skuDeProducto({ sku: "CAFE-001" })).toBe("CAFE-001");
  });

  it("busca items por una clave", () => {
    const cuerpo = { items: [{ id: "abc", nombre: "uno" }, { id: "def" }] };
    expect(itemDeLista(cuerpo, "id", "def")?.nombre).toBeUndefined();
    expect(itemDeLista(cuerpo, "id", "abc")?.nombre).toBe("uno");
    expect(itemDeLista(cuerpo, "id", "zzz")).toBeNull();
    expect(itemDeLista(null, "id", "abc")).toBeNull();
  });
});

describe("pasos y resumen", () => {
  it("acepta un status o una lista", () => {
    expect(pasoOk([200, 201], 201)).toBe(true);
    expect(pasoOk(200, 200)).toBe(true);
    expect(pasoOk([200], 422)).toBe(false);
  });

  it("separa hallazgos (con código) de fallas", () => {
    const resumen = resumir([
      { id: "panel", pasos: [{ nombre: "carga", ok: true }, { nombre: "api", ok: true }] },
      { id: "venta", pasos: [{ nombre: "carga", ok: true }, { nombre: "por-peso", ok: false, codigo: "venta-1", issue: "#474" }] },
      { id: "pagos", pasos: [{ nombre: "carga", ok: false, codigo: "pagos-1", issue: "#481" }] },
      { id: "rota", pasos: [{ nombre: "carga", ok: false }] },
    ]);
    expect(resumen.pantallas).toBe(4);
    expect(resumen.pasos).toBe(6);
    expect(resumen.pasosOk).toBe(3);
    expect(resumen.pasosFallidos).toBe(3);
    expect(resumen.hallazgos.map((h) => h.codigo)).toEqual(["venta-1", "pagos-1"]);
    expect(resumen.fallas.map((f) => f.pantalla)).toEqual(["rota"]);
  });

  it("tolera pantallas sin pasos", () => {
    expect(resumir([{ id: "x" }]).pasos).toBe(0);
  });
});

describe("errores de la API", () => {
  it("lee el mensaje string y los fieldErrors", () => {
    expect(mensajeDeError({ error: "stock insuficiente" })).toBe("stock insuficiente");
    expect(mensajeDeError({ error: { fieldErrors: { lineas: ["Poné un entero entre 1 y 999."] } } })).toBe(
      "lineas: Poné un entero entre 1 y 999.",
    );
    expect(mensajeDeError({ error: { formErrors: [], fieldErrors: {} } })).toBeNull();
    expect(mensajeDeError({})).toBeNull();
    expect(mensajeDeError(null)).toBeNull();
  });
});

describe("nombres y fechas", () => {
  it("normaliza el nombre de archivo", () => {
    expect(slugSeguro("Facturación ARCA")).toBe("Facturacion-ARCA");
    expect(slugSeguro(" panel/fiscal ")).toBe("panel-fiscal");
    expect(slugSeguro("")).toBe("pantalla");
  });

  it("usa la fecha de Buenos Aires", () => {
    // 02:00 UTC del 23 es todavía 22 en Buenos Aires (UTC-3).
    expect(fechaLocal(new Date("2026-11-23T02:00:00Z"))).toBe("2026-11-22");
    expect(fechaLocal(new Date("2026-11-23T12:00:00Z"))).toBe("2026-11-23");
  });
});
