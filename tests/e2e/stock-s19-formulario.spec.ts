import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ARTIFACTS = join(process.cwd(), ".agents/skills/control-app/artifacts");

test("formulario Agregar producto en stock a 390px", async ({ page }) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/panel/stock");
  const form = page.locator("#alta-producto-form");
  if (await form.count()) {
    await expect(page.locator("#alta-producto-card")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agregar producto" })).toBeVisible();
    await page.screenshot({
      path: join(ARTIFACTS, "stock-s19-alta-producto-390.png"),
      fullPage: true,
    });
  } else {
    await page.screenshot({
      path: join(ARTIFACTS, "stock-s19-sin-permiso-390.png"),
      fullPage: true,
    });
  }
});