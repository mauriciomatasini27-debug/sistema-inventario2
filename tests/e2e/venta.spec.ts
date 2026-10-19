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
  // device_seq nuevo: con VF-S2 un 422 por seq repetido ya no se reporta como "sync intentado".
  await page.evaluate(() => localStorage.setItem("slice0-seq", String(Date.now())));
  await context.setOffline(true);
  await page.fill("#sku", "demo-sku-1");
  await page.click("#cobrar");
  await expect(page.locator("#estado")).toContainText("provisorio", { timeout: 10_000 });
  await context.setOffline(false);
  await page.click("#sync");
  await expect(page.locator("#estado")).toContainText("sync intentado (1)", { timeout: 10_000 });
});

// VF-S2 (ADR-0097): si el push falla, la venta encolada no se borra.
test("sync con push caído deja la venta en la cola y la sube después", async ({ page, context }) => {
  await page.goto("/venta");
  // device_seq nuevo: el servidor de dev ya vio seq bajos de "caja-01" en los otros tests (422).
  await page.evaluate(() => {
    localStorage.removeItem("slice0-outbox");
    localStorage.setItem("slice0-seq", String(Date.now()));
  });
  await context.setOffline(true);
  await page.fill("#sku", "demo-sku-1");
  await page.click("#cobrar");
  await expect(page.locator("#estado")).toContainText("provisorio", { timeout: 10_000 });
  await context.setOffline(false);
  await page.route("**/api/sync/push", (route) => route.abort("failed"));
  await page.click("#sync");
  await expect(page.locator("#estado")).toContainText("sync cortado: 1 pendiente(s)", { timeout: 10_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("slice0-outbox") ?? "[]").length)).toBe(1);
  await page.unroute("**/api/sync/push");
  await page.click("#sync");
  await expect(page.locator("#estado")).toContainText("sync intentado (1)", { timeout: 10_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("slice0-outbox") ?? "[]").length)).toBe(0);
});
