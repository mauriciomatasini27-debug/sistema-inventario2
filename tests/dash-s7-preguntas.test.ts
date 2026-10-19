import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOMBRES_HERRAMIENTAS,
  crear_catalogo,
  detectar_intencion,
  type LecturasIA,
} from "../src/modules/ia/asistente.js";
import { cifrasDeHerramienta } from "../src/modules/ia/cifras.js";
import { preguntasSugeridas } from "../src/modules/ia/preguntas.js";
import { reporteDeHerramienta } from "../src/modules/ia/reportes.js";
import { crearLecturasIA } from "../src/lib/repos/ia-lecturas.js";

describe("DASH-S7 preguntas sugeridas", () => {
  it("hay entre 8 y 12 y todas son de herramientas con lectura conectada", () => {
    const lecturas = crearLecturasIA();
    const conectadas = new Set(
      Object.entries(lecturas)
        .filter(([, lectura]) => typeof lectura === "function")
        .map(([nombre]) => nombre),
    );
    const preguntas = preguntasSugeridas(lecturas, "dueno");

    expect(preguntas.length).toBeGreaterThanOrEqual(8);
    expect(preguntas.length).toBeLessThanOrEqual(12);
    expect(conectadas.size).toBe(5);
    expect(new Set(preguntas.map((p) => p.herramienta))).toEqual(conectadas);
    for (const pregunta of preguntas) {
      expect(conectadas.has(pregunta.herramienta)).toBe(true);
    }
  });

  it("cada pregunta cae exactamente en su herramienta con el catálogo real", () => {
    const catalogo = crear_catalogo(crearLecturasIA());
    for (const pregunta of preguntasSugeridas(crearLecturasIA(), "dueno")) {
      const detectada = detectar_intencion(pregunta.texto, catalogo);
      expect(detectada?.nombre, pregunta.texto).toBe(pregunta.herramienta);
    }
  });

  it("todas las plantillas caen en su herramienta si se conectan todas las lecturas", () => {
    const lecturas = Object.fromEntries(
      NOMBRES_HERRAMIENTAS.map((nombre) => [nombre, () => ({})]),
    ) as LecturasIA;
    const catalogo = crear_catalogo(lecturas);

    for (const pregunta of preguntasSugeridas(lecturas, "dueno")) {
      expect(detectar_intencion(pregunta.texto, catalogo)?.nombre, pregunta.texto).toBe(
        pregunta.herramienta,
      );
    }
  });

  it("un empleado nunca recibe preguntas de herramientas solo dueño", () => {
    const lecturas: LecturasIA = { margen_producto: () => ({ margenCentavos: 100 }) };

    expect(preguntasSugeridas(lecturas, "dueno").map((p) => p.herramienta)).toEqual([
      "margen_producto",
    ]);
    expect(preguntasSugeridas(lecturas, "empleado")).toEqual([]);
  });

  it("sin lecturas conectadas no sugiere nada", () => {
    expect(preguntasSugeridas({}, "dueno")).toEqual([]);
  });
});

describe("DASH-S7 reporte de origen", () => {
  it("cada herramienta apunta a una página .astro existente", () => {
    for (const herramienta of NOMBRES_HERRAMIENTAS) {
      const reporte = reporteDeHerramienta(herramienta);
      const relativa = reporte.href.replace(/#.*$/, "").replace(/^\//, "");
      const archivo = join(process.cwd(), "src", "pages", `${relativa}.astro`);
      expect(reporte.etiqueta.length, herramienta).toBeGreaterThan(0);
      expect(existsSync(archivo), `${herramienta} -> ${reporte.href}`).toBe(true);
    }
  });
});

describe("DASH-S7 cifras por herramienta", () => {
  it("caja_dia formatea centavos en pesos es-AR", () => {
    expect(
      cifrasDeHerramienta("caja_dia", {
        totalCentavos: 123456,
        porMedio: { Efectivo: "123456" },
        fuente: "memoria",
      }),
    ).toEqual([
      { etiqueta: "Total en caja", valor: "$ 1.234,56" },
      { etiqueta: "Efectivo", valor: "$ 1.234,56" },
    ]);
  });

  it("deudores formatea el saldo de cada cliente", () => {
    expect(
      cifrasDeHerramienta("deudores", [
        { nombre: "Juan", saldoCentavos: "50000", diasAtraso: 3 },
      ]),
    ).toEqual([{ etiqueta: "Juan", valor: "$ 500,00" }]);
  });

  it("ventas_periodo formatea ventas y tickets", () => {
    expect(
      cifrasDeHerramienta("ventas_periodo", {
        ventasMesCentavos: "987654",
        ticketsHoy: 12,
        fuente: "memoria",
      }),
    ).toEqual([
      { etiqueta: "Ventas del mes", valor: "$ 9.876,54" },
      { etiqueta: "Tickets hoy", valor: "12" },
    ]);
  });

  it("stock_bajo y por_vencer muestran cantidades y días literales", () => {
    expect(
      cifrasDeHerramienta("stock_bajo", [{ nombre: "Yerba", stock: 4, minimo: 10 }]),
    ).toEqual([{ etiqueta: "Yerba", valor: "4" }]);
    expect(
      cifrasDeHerramienta("por_vencer", [
        { sku: "demo-sku-1", dias: 3, cantidadRestante: 7, venceEl: "2026-10-20" },
      ]),
    ).toEqual([{ etiqueta: "demo-sku-1", valor: "3 días" }]);
  });

  it("un dato ausente no se completa con 0", () => {
    expect(cifrasDeHerramienta("ventas_periodo", { ticketsHoy: 2 })).toEqual([
      { etiqueta: "Tickets hoy", valor: "2" },
    ]);
    expect(cifrasDeHerramienta("caja_dia", {})).toEqual([]);
    expect(cifrasDeHerramienta("deudores", [{ nombre: "Ana" }])).toEqual([]);
    expect(cifrasDeHerramienta("stock_bajo", [])).toEqual([]);
    expect(cifrasDeHerramienta("por_vencer", [])).toEqual([]);
  });
});
