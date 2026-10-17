import { expect, test, type Page } from "@playwright/test";

async function sinDesbordeHorizontal(page: Page, tag: string) {
  const raiz = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(raiz.scrollWidth, `${tag}: documento`).toBeLessThanOrEqual(raiz.clientWidth + 1);
}

async function sinDesbordeElemento(page: Page, selector: string, tag: string) {
  const caja = page.locator(selector);
  await expect(caja).toBeVisible();
  const medidas = await caja.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(medidas.scrollWidth, `${tag}: ${selector}`).toBeLessThanOrEqual(medidas.clientWidth + 1);
}

async function correrHarness(page: Page, tag: string, url = "/venta?data=worst") {
  await page.goto(url);
  await sinDesbordeHorizontal(page, tag);

  const cobrar = page.locator("#cobrar");
  await expect(cobrar).toBeVisible();
  const box = await cobrar.boundingBox();
  expect(box?.height ?? 0, `${tag}: altura de #cobrar`).toBeGreaterThanOrEqual(44);

  await sinDesbordeElemento(page, "#estado", tag);
  await sinDesbordeElemento(page, "#balance", tag);

  const nombres = page.locator(".producto .nombre");
  const total = await nombres.count();
  expect(total, `${tag}: nombres de producto`).toBeGreaterThan(0);
  for (let i = 0; i < total; i += 1) {
    const medidas = await nombres.nth(i).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(medidas.scrollWidth, `${tag}: producto ${i}`).toBeLessThanOrEqual(medidas.clientWidth + 1);
  }
}

test.describe("venta worst-case 360x800", () => {
  test("sin desborde horizontal a 360px", async ({ page }, testInfo) => {
    await correrHarness(page, "360");
    await page.screenshot({ path: testInfo.outputPath("venta-worst-360.png"), fullPage: true });
  });
});

test.describe("venta worst-case zoom 200%", () => {
  test.use({ viewport: { width: 180, height: 400 }, deviceScaleFactor: 2 });
  test("sin desborde horizontal a 200%", async ({ page }, testInfo) => {
    await correrHarness(page, "zoom200");
    await page.screenshot({ path: testInfo.outputPath("venta-worst-zoom200.png"), fullPage: true });
  });
});

test.describe("venta worst-case dark", () => {
  test.use({ colorScheme: "dark" });
  test("sin desborde con prefers-color-scheme dark", async ({ page }, testInfo) => {
    await correrHarness(page, "dark");
    await page.screenshot({ path: testInfo.outputPath("venta-worst-dark.png"), fullPage: true });
  });
});

test.describe("venta worst-case RTL", () => {
  test("sin desborde con dir=rtl", async ({ page }, testInfo) => {
    await correrHarness(page, "rtl", "/venta?data=worst&dir=rtl");
    await page.screenshot({ path: testInfo.outputPath("venta-worst-rtl.png"), fullPage: true });
  });
});
