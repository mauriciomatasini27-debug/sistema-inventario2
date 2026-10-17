import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function leer(p: string) {
  return readFileSync(join(RAIZ, p), "utf8");
}

describe("DS-S15: listas alto volumen", () => {
  it("CSS de TablaCatalogo usa estilos correctos", () => {
    const css = leer("src/components/panel/TablaCatalogo.tsx");
    expect(css).toMatch(/font-size: \.875rem/);
    expect(css).toMatch(/font-weight: 600/);
    expect(css).toMatch(/var\(--tema-fila-hover\)/);
    expect(css).toMatch(/var\(--tema-fila-seleccionada\)/);
    expect(css).toMatch(/var\(--tema-enfasis\)/);
    expect(css).toMatch(/var\(--tema-borde-encabezado\)/);
    expect(css).not.toMatch(/font-size: 13px/);
    const estilos = css.slice(css.indexOf("<style>"));
    expect(estilos).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(estilos).not.toMatch(/transition:\s*(?!none)/);
    expect(css).toMatch(/tbody td\.sku, \.tabla-catalogo tbody td\.cantidad \{ font-weight: 500; color: var\(--tema-enfasis\); \}/);
    expect(css).toMatch(/data-seleccionada=\{seleccionada \? "true" : undefined\}/);
    expect(css).toMatch(/aria-current=\{seleccionada \? "true" : undefined\}/);
    expect(css).not.toMatch(/aria-selected/);
  });

  it("tema.css define roles en claro y oscuro", () => {
    const tema = leer("src/styles/tema.css");
    expect(tema).toMatch(/--tema-fila-hover/);
    expect(tema).toMatch(/--tema-fila-seleccionada/);
    expect(tema).toMatch(/--tema-enfasis/);
    expect(tema).toMatch(/--tema-borde-encabezado/);
    const claro = tema.slice(tema.indexOf(":root {"), tema.indexOf(":root[data-tema=\"oscuro\"]"));
    expect(claro).toMatch(/--tema-fila-hover/);
    expect(claro).toMatch(/--tema-fila-seleccionada/);
    expect(claro).toMatch(/--tema-enfasis/);
    expect(claro).toMatch(/--tema-borde-encabezado/);
    const oscuro = tema.slice(tema.indexOf(":root[data-tema=\"oscuro\"]"));
    for (const rol of ["--tema-fila-hover", "--tema-fila-seleccionada", "--tema-enfasis", "--tema-borde-encabezado"]) {
      expect(oscuro).toContain(`${rol}:`);
    }
  });

  it("enfasis claro no es star-warm", () => {
    const tema = leer("src/styles/tema.css");
    const claro = tema.slice(tema.indexOf(":root {"), tema.indexOf(":root[data-tema=\"oscuro\"]"));
    expect(claro).toMatch(/--tema-enfasis:\s*var\(--color-star-glow\)/);
    expect(tema).toMatch(/--tema-enfasis:\s*var\(--color-ember-ambar\)/);
  });
});
