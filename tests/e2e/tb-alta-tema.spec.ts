import { expect, test } from "@playwright/test";

const RUTAS = [
  { path: "/alta", nombre: "alta" },
  { path: "/alta/estado?tenant_id=demo-e2e", nombre: "estado" },
] as const;

for (const ancho of [390, 1280] as const) {
  for (const tema of ["claro", "oscuro"] as const) {
    for (const ruta of RUTAS) {
      test(`alta ${ruta.nombre} tema ${tema} a ${ancho}px`, async ({ page }) => {
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
        await expect(page.locator("[data-tema-toggle]")).toBeVisible();
        await page.screenshot({
          path: `test-results/tb-alta-${ruta.nombre}-${ancho}-${tema}.png`,
          fullPage: true,
        });
      });
    }
  }
}

test("alta: el toggle cambia data-tema en la misma página", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tema", "claro");
    } catch {
      /* Safari privado */
    }
  });
  await page.goto("/alta");
  await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
  await page.locator("[data-tema-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  await expect(page.locator("[data-tema-toggle]")).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-tema-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
});

test("alta: validación cliente marca nombre corto", async ({ page }) => {
  await page.goto("/alta");
  await page.locator("#nombre").fill("ab");
  await page.locator("#numero").fill("");
  await page.locator("#crear").click();
  await expect(page.locator("#nombre")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#error")).toContainText("Revisá los campos marcados");
});