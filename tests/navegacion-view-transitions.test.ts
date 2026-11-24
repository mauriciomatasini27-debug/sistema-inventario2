import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

function archivos(dir: string, rx: RegExp): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entrada.name}`;
    if (entrada.isDirectory()) out.push(...archivos(rel, rx));
    else if (rx.test(entrada.name)) out.push(rel);
  }
  return out;
}

const ASTROS = archivos("src", /\.astro$/);
const DOCUMENTOS = ASTROS.filter((f) => /<html[\s>]/.test(leer(f)));

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

  it("cada documento propio opta a la View Transition", () => {
    expect(DOCUMENTOS.length).toBeGreaterThanOrEqual(7);
    for (const documento of DOCUMENTOS) {
      const fuente = leer(documento);
      const importa = /import\s+["'][^"']*styles\/navegacion\.css["']/.test(fuente);
      expect(importa, `${documento} no importa styles/navegacion.css`).toBe(true);
    }
  });

  it("no se adopta el router SPA de Astro: el ADR mantiene el MPA", () => {
    const fuentes = archivos("src", /\.(astro|tsx?|ts)$/);
    for (const archivo of fuentes) {
      expect(leer(archivo), archivo).not.toContain("ClientRouter");
    }
    expect(leer("astro.config.mjs")).not.toContain("viewTransitions");
  });

  it("ningún enlace a /api se prefetchea como si fuera una página", () => {
    const anclasApi: Array<{ archivo: string; ancla: string }> = [];
    for (const archivo of ASTROS) {
      for (const ancla of leer(archivo).match(/<a\b[\s\S]*?>/g) ?? []) {
        if (/href="\/api[^"]*"/.test(ancla) || /href=\{accesos\.(comercio|admin)\.href\}/.test(ancla)) {
          anclasApi.push({ archivo, ancla });
        }
      }
    }
    expect(anclasApi.length).toBeGreaterThanOrEqual(7);
    for (const { archivo, ancla } of anclasApi) {
      expect(ancla, `${archivo}: ${ancla}`).toContain('data-astro-prefetch="false"');
    }
  });

  it("P1-99: ningún <script> con define:vars o is:inline usa import o export de módulo ES", () => {
    for (const archivo of ASTROS) {
      const fuente = leer(archivo);
      for (const match of fuente.matchAll(/<script\b([^>]*?)(?:\/>|>([\s\S]*?)<\/script>)/g)) {
        const attrs = match[1] ?? "";
        const cuerpo = match[2] ?? "";
        if (!cuerpo || !/\b(define:vars|is:inline)\b/.test(attrs) || /\btype=["']module["']/.test(attrs)) continue;
        expect(cuerpo, `${archivo} tiene import/export en <script${attrs}>`).not.toMatch(
          /^\s*(import|export)\s/m,
        );
      }
    }
  });
});
