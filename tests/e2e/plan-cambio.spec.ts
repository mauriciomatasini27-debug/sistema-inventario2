import { expect, test } from "@playwright/test";
import { vistaPlan } from "../../src/lib/plan-panel.js";
import { PLANES_EJEMPLO } from "../../src/modules/planes/catalogo.js";
import { parseFechaAR } from "../../src/lib/fecha-ar.js";

// PLAN-S4: con una baja programada, /panel/plan dice a qué plan pasa y cuándo,
// en texto legible (AA) en claro y oscuro, sin desbordar a 360px.
const hoy = parseFechaAR("2026-10-18")!;
const conCambio = vistaPlan({
  planId: "plus",
  catalogo: PLANES_EJEMPLO,
  consultasAsistenteMes: 3,
  hoy,
  planProgramado: "basico",
  fechaCambio: parseFechaAR("2026-11-18"),
});
const sinCambio = vistaPlan({ planId: "plus", catalogo: PLANES_EJEMPLO, consultasAsistenteMes: 3, hoy });

function contraste(fg: string, bg: string): number {
  const rgb = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [a, b] = [lum(rgb(fg)), lum(rgb(bg))].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

for (const tema of ["light", "dark"] as const) {
  test(`cambio programado visible y AA (${tema})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    await page.route("**/api/plan/resumen", (r) => r.fulfill({ json: conCambio }));
    await page.goto("/panel/plan");
    const aviso = page.locator("#plan-cambio");
    await expect(aviso).toBeVisible();
    await expect(aviso).toHaveText("Tu plan pasa a Básico el 18/11/2026.");
    // Fondo efectivo: compone las capas translúcidas (vidrio) hasta una opaca.
    const { fg, bg } = await aviso.evaluate((el) => {
      const parse = (s: string): number[] => {
        const n = (s.match(/-?\d*\.?\d+/g) ?? []).map(Number);
        const srgb = s.startsWith("color(");
        const [r = 0, g = 0, b = 0] = n.map((v, i) => (srgb && i < 3 ? v * 255 : v));
        const a = n.length > 3 ? n[3]! : 1;
        return [r, g, b, a];
      };
      const capas: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c[3]! > 0) capas.push(c);
        if (c[3]! >= 1) break;
      }
      let base = [255, 255, 255];
      for (const [r, g, b, a] of capas.reverse()) {
        base = [r! * a! + base[0]! * (1 - a!), g! * a! + base[1]! * (1 - a!), b! * a! + base[2]! * (1 - a!)];
      }
      const f = parse(getComputedStyle(el).color);
      return { fg: `rgb(${f[0]}, ${f[1]}, ${f[2]})`, bg: `rgb(${base.map(Math.round).join(", ")})` };
    });
    expect(contraste(fg, bg)).toBeGreaterThanOrEqual(4.5);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(0);
  });
}

test("sin cambio programado no hay aviso", async ({ page }) => {
  await page.route("**/api/plan/resumen", (r) => r.fulfill({ json: sinCambio }));
  await page.goto("/panel/plan");
  await expect(page.locator("#plan-nombre")).toHaveText("Plus");
  await expect(page.locator("#plan-cambio")).toBeHidden();
});
