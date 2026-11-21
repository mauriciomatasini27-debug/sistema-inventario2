import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { destinoSi, PASOS_WIZARD } from "../src/modules/onboarding/wizard.js";

// TB-165: las ramas «sí» salían a otra página sin guardar, así que el guardado
// final nunca se ejecutaba. TB-14: la semántica de la rama vive en el paso, no
// en la vista; acá se comprueba el destino por comportamiento y el orden
// guardar→navegar en la página (este último se convierte en el ticket 15).
const pagina = readFileSync("src/pages/onboarding.astro", "utf8");

function bloqueSalida(): string {
  const inicio = pagina.indexOf("const salida = destinoSi(paso, o)");
  if (inicio < 0) throw new Error("falta el uso de destinoSi en la vista");
  const fin = pagina.indexOf("window.location.href", inicio);
  return pagina.slice(inicio, fin < 0 ? inicio + 200 : fin);
}

function destino(key: string, respuesta: string): string | null {
  const paso = PASOS_WIZARD.find((p) => p.key === key);
  return destinoSi(paso, respuesta);
}

describe("TB-165: ramas «sí» del cuestionario", () => {
  it("productos avanza y guarda antes de abrir la importación", () => {
    expect(destino("productos", "Sí, cargar productos")).toBe("/panel/stock/importar");
    expect(bloqueSalida()).toContain("avanzar(state, o)");
    expect(bloqueSalida()).toContain("save()");
  });

  it("caja avanza y guarda antes de abrir la caja", () => {
    expect(destino("caja", "Sí, cargar monto")).toBe("/panel/caja");
    expect(bloqueSalida()).toContain("avanzar(state, o)");
    expect(bloqueSalida()).toContain("save()");
  });

  it("el guardado ocurre antes de navegar", () => {
    const bloque = bloqueSalida();
    expect(bloque.indexOf("save()", bloque.indexOf("avanzar(state, o)"))).toBeGreaterThan(-1);
  });

  it("al volver se retoma el paso guardado en localStorage", () => {
    expect(pagina).toContain("localStorage.getItem(storageKey)");
    expect(pagina).toMatch(/\.\.\.guardado/);
  });
});
