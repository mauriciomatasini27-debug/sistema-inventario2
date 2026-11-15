import { expect, test } from "@playwright/test";

// Landing LAND-S11: 13 beats en orden, hero con dos CTA, contacto que llega.
test("landing renderiza los 13 beats en orden", async ({ page }) => {
  await page.goto("/");
  for (const id of [
    "#inicio",
    "#problema",
    "#ejemplo",
    "#contraste",
    "#circuito",
    "#planes",
    "#checklist",
    "#migracion",
    "#fiscal",
    "#publico",
    "#despues",
    "#faq",
    "#contacto",
  ]) {
    await expect(page.locator(id)).toBeVisible();
  }
  await expect(page.locator("#solucion")).toHaveCount(0);
  await expect(page.locator("#camino")).toHaveCount(0);
  await expect(page.locator("#como-trabajamos")).toHaveCount(0);
  await expect(page.locator("#inicio h1")).toContainText("Stock en tiempo real");
});

test("hero muestra 2 CTA sin scroll horizontal a 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.locator('#inicio a[href="#planes"]')).toBeVisible();
  await expect(page.locator('#inicio a[href="#contacto"]')).toBeVisible();
  await expect(page.locator('#inicio a[href^="https://wa.me/"]')).toHaveCount(0);
  await expect(page.locator('#inicio a[href^="mailto:"]')).toHaveCount(0);
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
