import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// TB-165: el cuestionario tenía dos máquinas de estados: la pura en wizard.ts
// (sola la usaban los tests) y una copia inline en la página. Esta guardia
// impide que la copia vuelva: la página debe delegar las transiciones al módulo.
const PAGINA = "src/pages/onboarding.astro";
const fuente = readFileSync(PAGINA, "utf8");

describe("onboarding.astro delega el cuestionario al módulo dueño", () => {
  it("importa las transiciones desde wizard.js", () => {
    expect(fuente).toMatch(
      /import\s*\{[\s\S]*?\}\s*from\s*["'][^"']*onboarding\/wizard(\.js)?["']/,
    );
  });

  it("no declara su propia lista de pasos", () => {
    expect(fuente).not.toMatch(/const\s+steps\s*=\s*\[/);
  });

  it("no muta el paso a mano: usa las transiciones del módulo", () => {
    expect(fuente).not.toMatch(/state\.paso\s*\+\+/);
  });
});
