import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = (p: string): string => readFileSync(p, "utf8");

describe("STOCK-R8: contrato visual del catálogo simplificado", () => {
  it("la tabla de stock usa las cinco columnas acordadas", () => {
    const tabla = leer("src/components/panel/TablaCatalogo.tsx");
    expect(tabla).toContain('["Código de producto", "Nombre", "Precio", "Stock disponible", "Mínimo"]');
    expect(tabla).not.toContain('"A reponer"');
    expect(tabla).toContain("p.stock_disponible");
    expect(tabla).toContain("Sin mínimo cargado: la alerta usa rotación de 7 días");
  });

  it("/panel/stock pide el catálogo derivado y muestra el KPI correcto", () => {
    const stock = leer("src/pages/panel/stock.astro");
    expect(stock).toContain('url: "/api/products?panel=1"');
    expect(stock).toContain("<small>Bajo mínimo</small>");
    expect(stock).toContain("sin verificar");
    expect(stock).not.toContain("<small>Con stock mínimo</small>");
  });

  it("el campo de código es único y el conteo usa el rol efectivo", () => {
    const stock = leer("src/pages/panel/stock.astro");
    expect(stock).toContain('id="codigo-producto"');
    expect(stock).toContain("Registrar ingreso");
    expect(stock).toContain("Contar stock");
    expect(stock).toContain("Consultar lotes");
    expect(stock).not.toContain('rol: "dueno"');
    expect(stock).toContain("rolActual()");
    expect(stock).toContain("clavesIdempotencia");
  });

  it("el catálogo y la acción se acomodan por ancho de pantalla", () => {
    const stock = leer("src/pages/panel/stock.astro");
    expect(stock).toContain("panel-stock-layout");
    expect(stock).toContain(".panel-stock-catalogo { order: 2; min-width: 0; }");
    expect(stock).toContain(".panel-stock-accion { order: 1; min-width: 0; }");
    expect(stock).toContain("@media (min-width: 900px)");
  });

  it("solo el bloque de acción ganadora queda visible", () => {
    const stock = leer("src/pages/panel/stock.astro");
    expect(stock).toContain('id="cola-cabecera"');
    expect(stock).toContain("derivarProximaAccion");
    expect(stock).toContain('$("precio-pendiente").hidden = accion.tipo !== "precio"');
    expect(stock).toContain('$("stock-inicial").hidden = accion.tipo !== "stock_inicial"');
    expect(stock).toContain('$("catalogo-sugerido").hidden = accion.tipo !== "sugerido"');
  });
});
