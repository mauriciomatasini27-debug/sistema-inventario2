import { expect, test, type Page } from "@playwright/test";

async function sinDesbordeHorizontal(page: Page, tag: string) {
  const raiz = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(raiz.scrollWidth, `${tag}: documento`).toBeLessThanOrEqual(raiz.clientWidth + 1);
}

// Virtuoso mide filas reales mientras scrollea y la altura total crece: se baja
// hasta el fondo varias veces hasta que aparece la última fila.
async function scrollAlFondoHasta(page: Page, sku: string) {
  const celda = page.getByRole("cell", { name: sku, exact: true });
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      return celda.isVisible();
    }, { message: `scroll hasta ${sku}`, timeout: 15000 })
    .toBe(true);
}

async function correrMil(page: Page, url: string, tag: string) {
  await page.goto(url);
  // client:visible no hidruta la isla fuera del viewport: en stock a 360px hay que
  // acercar el catálogo antes de esperar las 1000 filas.
  await page.locator('[data-harness="mil"]').scrollIntoViewIfNeeded();
  await expect(page.locator("table[aria-rowcount]"), `${tag}: tabla`).toHaveAttribute("aria-rowcount", "1000");
  await sinDesbordeHorizontal(page, tag);
  expect(await page.locator("table tr").count(), `${tag}: filas en el DOM`).toBeLessThan(80);
}

test.describe("catalogo mil filas 360x800", () => {
  test("/panel/precios virtualiza 1000 filas y llega a MIL-1000", async ({ page }, testInfo) => {
    await correrMil(page, "/panel/precios?data=mil", "precios");
    await scrollAlFondoHasta(page, "MIL-1000");
    await page.screenshot({ path: testInfo.outputPath("catalogo-precios-360.png"), fullPage: true });
  });

  test("/panel/stock virtualiza 1000 filas sin desborde", async ({ page }) => {
    await correrMil(page, "/panel/stock?data=mil", "stock");
  });
});

test.describe("catalogo mil con reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("/panel/precios sin animacion y sin desborde", async ({ page }) => {
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await correrMil(page, "/panel/precios?data=mil", "reduce");
    await scrollAlFondoHasta(page, "MIL-1000");
  });
});
