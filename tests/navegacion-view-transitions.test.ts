import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

const SHELLS = [
  "src/layouts/BaseLayout.astro",
  "src/components/panel/PanelShell.astro",
  "src/pages/venta.astro",
  "src/pages/admin.astro",
  "src/components/alta/AltaShell.astro",
  "src/pages/t/[token].astro",
];

describe("NAV-S1: prefetch y View Transitions nativas (ADR-0130)", () => {
  it("astro.config.mjs habilita prefetch al pasar el puntero", () => {
    const config = leer("astro.config.mjs");
    expect(config).toMatch(/prefetch:\s*{[\s\S]*prefetchAll:\s*true/);
    expect(config).toMatch(/defaultStrategy:\s*["']hover["']/);
  });

  it("las transiciones son cross-document y respetan prefers-reduced-motion", () => {
    const css = leer("src/styles/navegacion.css");
    expect(css).toMatch(/@view-transition\s*{\s*navigation:\s*auto;?\s*}/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
  });

  it("todas las páginas con documento propio cargan la hoja de navegación", () => {
    const global = leer("src/styles/global.css");
    const papel = leer("src/styles/tokens-papel.css");
    expect(global).toContain("@import './navegacion.css'");
    expect(papel).toContain("@import './navegacion.css'");
    for (const shell of SHELLS) {
      const fuente = leer(shell);
      expect(
        fuente.includes("styles/global.css") || fuente.includes("styles/tokens-papel.css"),
        `${shell} no importa global.css ni tokens-papel.css`,
      ).toBe(true);
    }
  });

  it("no se adopta el router SPA de Astro: el ADR mantiene el MPA", () => {
    for (const shell of SHELLS) {
      expect(leer(shell), shell).not.toContain("ClientRouter");
    }
    expect(leer("astro.config.mjs")).not.toContain("viewTransitions");
  });

  it("los enlaces a /api no se prefetchean como si fueran páginas", () => {
    const fuentes = [
      "src/pages/panel/stock/importar.astro",
      "src/components/panel/StockCard.astro",
      "src/components/panel/PagarServicioCard.astro",
      "src/components/panel/AjustesCard.astro",
      "src/components/panel/ShiftTimeline.astro",
    ];
    for (const archivo of fuentes) {
      const anclas = leer(archivo).match(/<a\b[^>]*href="\/api[^"]*"[^>]*>/g) ?? [];
      expect(anclas.length, `${archivo} no tiene enlaces a /api`).toBeGreaterThan(0);
      for (const ancla of anclas) {
        expect(ancla, `${archivo}: ${ancla}`).toContain('data-astro-prefetch="false"');
      }
    }
  });
});
