import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

describe("TB-TEMA-CLARO: piel B solo en oscuro", () => {
  it("PanelShell no fuerza void en body sin data-tema=oscuro", () => {
    const shell = leer("src/components/panel/PanelShell.astro");
    expect(shell).not.toMatch(/body:has\(\.tablero\)\s*\{[^}]*--color-void/);
    expect(shell).toContain(':root[data-tema="oscuro"] .tablero.panel-shell');
    expect(shell).toContain("--tema-fondo: var(--color-void)");
  });

  it("NavTablero sigue tokens de tema", () => {
    const nav = leer("src/components/panel/NavTablero.astro");
    expect(nav).toContain("color: var(--tema-texto)");
    expect(nav).toContain("background: var(--tema-fondo)");
    expect(nav).not.toMatch(/\.nav-tablero\s*\{[^}]*color:\s*var\(--color-star-white\)/);
  });

  it("PanelTopbar usa tema-barra y tema-texto", () => {
    const barra = leer("src/components/panel/PanelTopbar.astro");
    expect(barra).toContain("background: var(--tema-barra)");
    expect(barra).toContain("color: var(--tema-texto)");
    expect(barra).not.toContain("background: color-mix(in srgb, var(--color-void)");
  });

  it("/venta toma fondo del token tema en claro", () => {
    const venta = leer("src/pages/venta.astro");
    expect(venta).toContain("background: var(--tema-fondo)");
    expect(venta).not.toMatch(/body\s*\{[^}]*background:\s*var\(--color-void\)/);
    expect(venta).toContain(':root[data-tema="oscuro"] .tablero .vidrio-card');
  });

  it("/admin define piel B solo en oscuro", () => {
    const admin = leer("src/pages/admin.astro");
    expect(admin).toContain(':root[data-tema="oscuro"]');
    expect(admin).toContain("--papel: var(--tema-fondo)");
    expect(admin).toMatch(/:root\[data-tema="oscuro"\]\s*\{[\s\S]*--papel:\s*var\(--color-void\)/);
  });
});

describe("TB-TEMA-CLARO: contraste observable", () => {
  it("en claro el shell usa texto void desde tema.css", () => {
    const tema = leer("src/styles/tema.css");
    expect(tema).toContain("--tema-texto: var(--color-void)");
    const shell = leer("src/components/panel/PanelShell.astro");
    expect(shell).toMatch(/body\s*\{[^}]*color:\s*var\(--tema-texto\)/);
  });
});