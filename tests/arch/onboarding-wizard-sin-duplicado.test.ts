import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// TB-165: guardia de arquitectura. El cuestionario tenía dos máquinas de
// estados (la pura en wizard.ts y una copia inline en la página) y la
// semántica de cada rama partida entre módulo y vista. La página delega las
// transiciones al módulo y no reinterpreta claves ni destinos.
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

  it("TB-14: no compara claves de paso ni hardcodea destinos de rama", () => {
    expect(fuente).not.toMatch(/paso\.key\s*===\s*["'](empleados|productos|caja)["']/);
    expect(fuente).not.toContain("/panel/stock/importar");
    expect(fuente).not.toContain("/panel/caja");
  });

  it("TB-165: ofrece salida al panel y retoma el avance guardado", () => {
    expect(fuente).toContain('href="/panel"');
    expect(fuente).toContain("localStorage.getItem(storageKey)");
  });
});
