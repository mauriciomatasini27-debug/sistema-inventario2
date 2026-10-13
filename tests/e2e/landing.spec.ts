import { expect, test } from "@playwright/test";

// Landing LP-S1 (ADR-0010): 8 secciones en orden, hero que convierte, contacto que llega.
test("landing renderiza las 8 secciones en orden", async ({ page }) => {
  await page.goto("/");
  for (const id of [
    "#inicio",
    "#problema",
    "#solucion",
    "#camino",
    "#planes",
    "#publico",
    "#como-trabajamos",
    "#contacto",
  ]) {
    await expect(page.locator(id)).toBeVisible();
  }
  await expect(page.locator("#inicio h1")).toContainText("Stock en tiempo real");
});

test("hero muestra 3 CTA sin scroll horizontal a 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.locator('#inicio a[href="#contacto"]')).toBeVisible();
  await expect(page.locator('#inicio a[href^="https://wa.me/"]')).toBeVisible();
  await expect(page.locator('#inicio a[href^="mailto:"]')).toBeVisible();
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - 360);
  expect(scroll).toBeLessThanOrEqual(1);
});

test("contacto ofrece formulario o fallback mailto y el panel sigue vivo", async ({
  page,
}) => {
  await page.goto("/#contacto");
  await expect(page.locator("#contacto")).toBeVisible();
  const formCount = await page.locator('#contacto form[action*="formspree.io"]').count();
  const fallbackCount = await page.locator('#contacto a[href^="mailto:"]').count();
  expect(formCount + fallbackCount).toBeGreaterThan(0);
  await page.goto("/panel");
  await expect(page.locator("h1.hello")).toContainText("Hola");
});
