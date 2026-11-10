import { expect, test } from "@playwright/test";

// Marca 2: el segbar vacío en oscuro no muestra un segmento blanco, "Vender →"
// no envuelve la flecha a 360px y /admin pinta oscuro sin desborde.
const VACIO = { tickets_hoy: 0, stock_bajo: 0, por_medio: [] };

test.describe("marca 2 en oscuro", () => {
  test.use({ colorScheme: "dark" });

  test("/panel: el segbar vacío usa el fondo de la barra, no blanco", async ({ page }) => {
    await page.route("**/api/sales/resumen", (r) => r.fulfill({ json: VACIO }));
    await page.goto("/panel");
    const vacio = page.locator("#segbar span.vacio");
    await expect(vacio).toHaveText("Sin ventas este mes");
    const colores = await vacio.evaluate((el) => {
      const barra = el.parentElement;
      if (!barra) throw new Error("span.vacio sin #segbar");
      return {
        fondo: getComputedStyle(el).backgroundColor,
        barra: getComputedStyle(barra).backgroundColor,
        ancho: el.getBoundingClientRect().width,
        anchoBarra: barra.getBoundingClientRect().width,
      };
    });
    expect(colores.fondo).not.toBe("rgb(255, 255, 255)");
    expect(colores.fondo).toBe(colores.barra);
    expect(colores.ancho).toBeGreaterThanOrEqual(colores.anchoBarra - 1);
  });

  test("/admin: fondo oscuro, toggle presionado y sin desborde", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
    const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(fondo).toBe("rgb(26, 26, 26)");
    await expect(page.locator("button[data-tema-toggle]")).toHaveAttribute("aria-pressed", "true");
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(desborde).toBeLessThanOrEqual(1);
  });
});

for (const ruta of [
  { url: "/panel", texto: "Vender", sel: ".atajos a.sg-flame-cta" },
  { url: "/admin", texto: "Ver mora →", sel: ".banner a" },
]) {
  test(`${ruta.url}: "${ruta.texto}" entra en una línea a 360px`, async ({ page }) => {
    await page.goto(ruta.url);
    const boton = page.locator(ruta.sel);
    await expect(boton).toHaveText(ruta.texto);
    const caja = await boton.boundingBox();
    // 44px de mínimo táctil: con la flecha en otra línea pasaría de 50.
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(caja?.height ?? 99).toBeLessThanOrEqual(50);
  });
}
