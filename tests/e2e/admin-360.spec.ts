import { expect, test } from "@playwright/test";

// /admin a 360px medía 401px por la tabla de auditoría (acciones largas sin corte).
test("/admin sin desborde horizontal a 360px", async ({ page }) => {
  await page.goto("/admin");
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(ancho).toBeLessThanOrEqual(1);
});
