import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGB = /\brgba?\s*\(/i;

function walk(rel: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, rel), { withFileTypes: true })) {
    const hijo = `${rel}/${entrada.name}`;
    if (entrada.isDirectory()) salida.push(...walk(hijo));
    else if (entrada.name.endsWith(".astro")) salida.push(hijo);
  }
  return salida;
}

const OBJETIVO = [...walk("src/components/panel"), ...walk("src/pages/panel")];

describe("panel: colores siempre por token de Tema Papel", () => {
  it("hay componentes y pantallas que revisar", () => {
    expect(OBJETIVO.length).toBeGreaterThan(0);
  });

  it("ningún componente ni pantalla del panel tiene hex o rgb hardcodeado", () => {
    for (const f of OBJETIVO) {
      const sinVars = readFileSync(join(RAIZ, f), "utf8").replace(/var\([^)]*\)/g, "");
      expect(sinVars, f).not.toMatch(HEX);
      expect(sinVars, f).not.toMatch(RGB);
    }
  });

  it("StockCard usa controles táctiles de 44px", () => {
    const stock = readFileSync(join(RAIZ, "src/components/panel/StockCard.astro"), "utf8");
    expect(stock).not.toContain("min-height:36px");
    expect(stock).toContain("min-height:44px");
  });
});

describe("panel: los tokens --color-* existen donde se usan", () => {
  const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");
  const tokens = (css: string) =>
    Object.fromEntries([...css.matchAll(/(--color-[\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]]));

  it("tokens-papel.css es espejo exacto del @theme de global.css", () => {
    const global = leer("src/styles/global.css");
    const theme = global.slice(global.indexOf("@theme {"), global.indexOf("}", global.indexOf("@theme {")));
    expect(tokens(leer("src/styles/tokens-papel.css"))).toEqual(tokens(theme));
  });

  it("/panel (sin global.css) importa tokens-papel.css y su paleta local apunta a los tokens", () => {
    const panel = leer("src/pages/panel.astro");
    expect(panel).toContain('import "../styles/tokens-papel.css"');
    expect(panel).toContain("--muted: var(--color-ash)");
  });
});
