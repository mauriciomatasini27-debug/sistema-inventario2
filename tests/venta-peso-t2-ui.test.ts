import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { totalCentavosCarrito } from "../src/modules/sales/vuelto_efectivo.js";

const src = (): string => readFileSync("src/pages/venta.astro", "utf8");

describe("T2 #386 UI: carga de kilogramos y error en el campo", () => {
  it("el campo de peso es texto con inputmode decimal y muestra error de campo", () => {
    const s = src();
    expect(s).toContain('id="cantidad-etiqueta"');
    expect(s).toContain('id="precio-etiqueta"');
    expect(s).toMatch(/id="qty"[^>]*type="text"[^>]*inputmode="decimal"/);
    expect(s).toContain('id="peso-error"');
    expect(s).toMatch(/id="peso-error"[^>]*role="alert"/);
  });

  it("usa el flag del snapshot offline y la conversión pura antes de armar la línea", () => {
    const s = src();
    expect(s).toMatch(/import \{[^}]*esPorPesoLocal[^}]*\} from "\.\.\/offline\/catalogo-local\.js"/);
    expect(s).toContain('from "../modules/sales/linea_peso.js"');
    expect(s).toContain("convertirKgAGramos(");
    expect(s).toContain("mensajeErrorPeso(");
    expect(s).toContain("porPeso: true");
    expect(s).toContain('porPeso ? "Ej. 1,250"');
  });

  it("el total y el vuelto usan la misma regla de subtotal por peso", () => {
    const s = src();
    expect(s).toContain("subtotalLinea(");
    expect(s).toContain("porPesoActual()");
    expect(totalCentavosCarrito([
      { qty: 2, precio_centavos: 15000 },
      { qty: 1250, precio_centavos: 5000, porPeso: true },
    ])).toBe(36250);
  });

  it("el ticket de pantalla muestra la línea en kg × $/kg = subtotal", () => {
    const s = src();
    expect(s).toContain("l.descripcion");
    expect(s).toContain("l.subtotal");
    expect(s).toContain("formatearKilogramos(");
    const bloque = s.slice(s.indexOf("const pintarTicket"), s.indexOf("const publicarTicket"));
    expect(bloque).toContain("l.porPeso");
    expect(bloque).toContain("l.descripcion");
  });
});
