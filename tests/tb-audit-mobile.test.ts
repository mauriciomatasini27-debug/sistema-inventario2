import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

describe("TB-AUDIT-MOBILE: hallazgos tablero B", () => {
  it("TablaCatalogo permite scroll horizontal del catálogo en móvil", () => {
    const tsx = leer("src/components/panel/TablaCatalogo.tsx");
    expect(tsx).toContain("tabla-catalogo-scroll");
    expect(tsx).toMatch(/tabla-catalogo--stock[\s\S]*min-width: 22rem/);
    expect(tsx).toContain("white-space: nowrap");
  });

  it("Más abre Ajustes con Problemas y sugerencias visible (sin segundo toque)", () => {
    const nav = leer("src/components/panel/NavTablero.astro");
    expect(nav).toContain('open={grupo.id === "ajustes"}');
    expect(nav).toContain("data-abrir-reportes-comercio");
  });

  it("/venta alinea vidrio-card al void del tablero B", () => {
    const venta = leer("src/pages/venta.astro");
    expect(venta).toContain("TB-AUDIT-MOBILE");
    expect(venta).toContain("--tema-superficie: var(--color-charcoal)");
    expect(venta).toContain(".tablero .vidrio-card");
  });
});
