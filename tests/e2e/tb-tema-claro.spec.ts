import { expect, test } from "@playwright/test";

const RUTAS = [
  { path: "/panel", nombre: "inicio" },
  { path: "/panel/stock", nombre: "stock" },
  { path: "/panel/fiado", nombre: "fiado" },
  { path: "/panel/caja", nombre: "caja" },
  { path: "/venta", nombre: "venta" },
] as const;

for (const ancho of [390, 1280] as const) {
  for (const tema of ["claro", "oscuro"] as const) {
    test(`panel tema ${tema} a ${ancho}px sin texto blanco fantasma (inicio)`, async ({ page }) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("tema", t);
        } catch {
          /* Safari privado */
        }
      }, tema);
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto("/panel");
      await expect(page.locator("html")).toHaveAttribute("data-tema", tema);
      const body = page.locator("body");
      const color = await body.evaluate((el) => getComputedStyle(el).color);
      if (tema === "claro") {
        expect(color).not.toBe("rgb(255, 255, 255)");
      } else {
        expect(color).toBe("rgb(255, 255, 255)");
      }
      await page.screenshot({
        path: `test-results/tb-tema-claro-panel-${ancho}-${tema}.png`,
        fullPage: true,
      });
    });
  }
}

for (const ancho of [390, 1280] as const) {
  for (const tema of ["claro", "oscuro"] as const) {
    for (const ruta of RUTAS) {
      test(`${ruta.nombre} ${tema} ${ancho}px pinta data-tema`, async ({ page }) => {
        await page.addInitScript((t) => {
          try {
            localStorage.setItem("tema", t);
          } catch {
            /* Safari privado */
          }
        }, tema);
        await page.setViewportSize({ width: ancho, height: 900 });
        await page.goto(ruta.path);
        await expect(page.locator("html")).toHaveAttribute("data-tema", tema);
        if (ruta.nombre === "venta" || (ancho === 390 && ruta.nombre === "inicio")) {
          await page.screenshot({
            path: `test-results/tb-tema-claro-${ruta.nombre}-${ancho}-${tema}.png`,
            fullPage: true,
          });
        }
      });
    }
  }
}