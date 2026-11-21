import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// TB-165: las ramas «sí» salían a otra página sin guardar, así que el guardado
// final nunca se ejecutaba. Esta guardia exige avanzar y persistir ANTES de
// navegar, y que el progreso se recupere al volver.
const pagina = readFileSync("src/pages/onboarding.astro", "utf8");

function rama(key: "productos" | "caja"): string {
  const inicio = pagina.indexOf(`paso.key === "${key}"`);
  if (inicio < 0) throw new Error(`falta la rama ${key}`);
  const fin = pagina.indexOf("window.location.href", inicio);
  return pagina.slice(inicio, fin < 0 ? inicio + 200 : fin);
}

describe("TB-165: ramas «sí» del cuestionario", () => {
  it("productos avanza y guarda antes de abrir la importación", () => {
    expect(rama("productos")).toContain("avanzar(state, o)");
    expect(rama("productos")).toContain("save()");
    expect(pagina).toContain("/panel/stock/importar");
  });

  it("caja avanza y guarda antes de abrir la caja", () => {
    expect(rama("caja")).toContain("avanzar(state, o)");
    expect(rama("caja")).toContain("save()");
    expect(pagina).toContain("/panel/caja");
  });

  it("el guardado ocurre antes de navegar en ambas ramas", () => {
    for (const key of ["productos", "caja"] as const) {
      const bloque = rama(key);
      expect(bloque.indexOf("save()", bloque.indexOf("avanzar(state, o)"))).toBeGreaterThan(-1);
    }
  });

  it("al volver se retoma el paso guardado en localStorage", () => {
    expect(pagina).toContain("localStorage.getItem(storageKey)");
    expect(pagina).toMatch(/\.\.\.guardado/);
  });
});
