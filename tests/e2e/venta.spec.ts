import { expect, test } from "@playwright/test";

// Slice-0 E2E (ADR-0017): /venta a 360px. Cobro feliz online + corte de red con
// provisorio DeviceCode-SeqLocal y reintento sin duplicar (mismo op_id).
test("cobro feliz crea ticket definitivo y balance cuadra", async ({ page }) => {
  await page.goto("/venta");
  await page.fill("#sku", "demo-sku-1");
  await page.fill("#qty", "1");
  await page.selectOption("#medio", "Efectivo");
  await page.click("#cobrar");
  await expect(page.locator("#estado")).toContainText("201", { timeout: 10_000 });
  await expect(page.locator("#estado")).toContainText("T-");
  await expect(page.locator("#balance")).not.toContainText("Balance: —");
});

test("corte de red: provisorio encolado y sync no duplica", async ({ page, context }) => {
  await page.goto("/venta");
  await context.setOffline(true);
  await page.fill("#sku", "demo-sku-1");
  await page.click("#cobrar");
  await expect(page.locator("#estado")).toContainText("provisorio", { timeout: 10_000 });
  await context.setOffline(false);
  await page.click("#sync");
  await expect(page.locator("#estado")).toContainText("sync intentado (1)", { timeout: 10_000 });
});
