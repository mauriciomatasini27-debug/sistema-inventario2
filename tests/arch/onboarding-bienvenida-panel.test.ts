import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAMPOS_PROHIBIDOS_BIENVENIDA_PANEL } from "../../src/modules/onboarding/bienvenida-panel.js";

// BIEN-S2/BIEN-S3: restricciones de arquitectura, no de comportamiento. Acá
// está permitido leer fuente; las conductas se prueban en
// tests/onboarding-bienvenida-panel.test.ts y en la guía del Empleado.
const RAIZ = process.cwd();
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

describe("bienvenida del panel: restricciones de arquitectura", () => {
  it("el componente no pide dirección, CUIT, moneda ni cantidad de empleados", () => {
    const html = leer("src/components/panel/BienvenidaDialog.astro").toLowerCase();
    for (const campo of CAMPOS_PROHIBIDOS_BIENVENIDA_PANEL) {
      expect(html, campo).not.toContain(`name="${campo}"`);
      expect(html, campo).not.toContain(`id="${campo}"`);
    }
    expect(html).not.toContain("type=\"number\"");
    expect(html).not.toMatch(/cuil|cuit/i);
  });

  it("TB-165: panel.astro decide el diálogo en servidor con el guard de Dueño", () => {
    const panel = leer("src/pages/panel.astro");
    expect(panel).toContain("esDueno(");
    expect(panel).toMatch(/mostrarBienvenida \?/);
  });
});
