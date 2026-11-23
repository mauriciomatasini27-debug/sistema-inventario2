import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

const shell = leer("src/components/panel/PanelShell.astro");
const tema = leer("src/styles/tema.css");
const topbar = leer("src/components/panel/PanelTopbar.astro");
const medidor = leer("scripts/medir-pintado.mjs");

describe("NAV-S5: blur de tarjetas y medidor de pintado", () => {
  it("las tarjetas masivas del panel no pagan backdrop-filter", () => {
    const reglaCard = shell.match(/\.panel-shell \.card \{[^}]*\}/)?.[0] ?? "";
    expect(reglaCard).toContain("var(--tema-superficie)");
    expect(reglaCard).not.toContain("vidrio");
    expect(shell).not.toMatch(/backdrop-filter:\s*blur/);
  });

  it("el vidrio queda en superficies chicas con fallback de transparencia", () => {
    expect(topbar).toContain("backdrop-filter: blur(16px)");
    expect(tema).toContain(".vidrio-barra");
    expect(tema).toContain("backdrop-filter: blur(16px) saturate(1.2)");
    expect(tema).toContain("prefers-reduced-transparency");
  });

  it("el medidor cubre INP/CLS, blur y las pantallas del panel", () => {
    expect(medidor).toContain("layout-shift");
    expect(medidor).toContain('"event"');
    expect(medidor).toContain("backdropFilter");
    for (const ruta of ["/panel/caja", "/panel/stock", "/panel/precios", "/panel/reportes"]) {
      expect(medidor).toContain(ruta);
    }
  });
});
