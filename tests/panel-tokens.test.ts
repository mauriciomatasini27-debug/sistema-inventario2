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

  it("/panel delega el chrome al shell y el shell apunta la paleta a tokens", () => {
    const panel = leer("src/pages/panel.astro");
    const shell = leer("src/components/panel/PanelShell.astro");
    expect(panel).toContain("PanelShell");
    expect(shell).toContain('import "../../styles/global.css"');
    expect(shell).toContain("--muted: var(--tema-texto-suave)");
    expect(shell).toContain("var(--color-void)");
    expect(panel).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("el tablero usa void, charcoal y mid, sin tokens --mo-", () => {
    const nav = leer("src/components/panel/NavTablero.astro");
    const shell = leer("src/components/panel/PanelShell.astro");
    for (const token of ["var(--color-void)", "var(--color-charcoal)", "var(--color-mid)"]) {
      expect(nav, token).toContain(token);
      expect(shell, token).toContain(token);
    }
    expect(nav).not.toContain("--mo-");
    expect(shell).not.toContain("--mo-");
  });
});
