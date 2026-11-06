import { expect, test } from "@playwright/test";

// Slice-0 E2E (ADR-0017): /venta a 360px. Cobro feliz online + corte de red con
// provisorio DeviceCode-SeqLocal y reintento sin duplicar (mismo op_id).
test("cobro feliz crea ticket definitivo y balance cuadra", async ({ page }) => {
  await page.goto("/venta");
  await page.fill("#sku", "demo-sku-1");
  await page.fill("#qty", "1");
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito")).toContainText("demo-sku-1", { timeout: 10_000 });
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
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito")).toContainText("demo-sku-1", { timeout: 10_000 });
  await page.click("#cobrar");
  await expect(page.locator("#estado")).toContainText("provisorio", { timeout: 10_000 });
  await expect(page.locator("#tarjeta-ticket")).toContainText("demo-sku-1");
  await context.setOffline(false);
  await expect(page.locator("#estado")).toContainText("sync intentado (1)", { timeout: 10_000 });
  await page.click("#sync");
  await expect(page.locator("#estado")).toContainText("sync intentado (0)", { timeout: 10_000 });
});

// PWA-S2 (ADR-0003): catálogo proactivo local, precio sin red desde el snapshot.
test("catálogo descargado completa el precio y sigue disponible offline", async ({ page, context }) => {
  await page.route("**/api/sync/pull**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ catalogo: { stock: { "demo-sku-1": 7 }, prices: { "demo-sku-1": 999 } } }),
    }),
  );
  await page.goto("/venta");
  await expect(page.locator("#catalogo-estado")).toContainText("Catálogo del", { timeout: 10_000 });
  await page.fill("#sku", "demo-sku-1");
  await expect(page.locator("#precio")).toHaveValue("999");

  await context.setOffline(true);
  await page.fill("#sku", "demo-sku-2");
  await page.fill("#sku", "demo-sku-1");
  await expect(page.locator("#precio")).toHaveValue("999");
  await expect(page.locator("#catalogo-estado")).toContainText("Catálogo del");
});

// PWA-S2b (ADR-0003): abrir /venta directo registra el SW, guarda sus assets y
// la página vuelve a abrir sin red con JS funcionando.
test("PWA-S2b: /venta abierto directo vuelve sin red con su JS", async ({ page, context }) => {
  await page.goto("/venta");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 15_000 });
  const assets = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script[src], link[rel='stylesheet']"))
      .map((el) => {
        const raw = el.getAttribute("src") ?? el.getAttribute("href");
        return raw ? new URL(raw, location.origin).href : "";
      })
      .filter(Boolean),
  );
  await expect
    .poll(() =>
      page.evaluate(async (urls) => {
        const cache = await caches.open("inventario-v4");
        const hits = await Promise.all(urls.map((url) => cache.match(url)));
        return hits.length > 0 && hits.every(Boolean);
      }, assets),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Venta mostrador");
  await page.fill("#sku", "demo-sku-2");
  await page.fill("#qty", "2");
  await page.fill("#precio", "500");
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito")).toContainText("demo-sku-2", { timeout: 10_000 });
  await page.click("#cobrar");
  await expect(page.locator("#estado")).toContainText("provisorio", { timeout: 10_000 });
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
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito")).toContainText("demo-sku-1", { timeout: 10_000 });
  await page.click("#cobrar");
  await expect(page.locator("#estado")).toContainText("provisorio", { timeout: 10_000 });
  await page.route("**/api/sync/push", (route) => route.abort("failed"));
  await context.setOffline(false);
  await expect(page.locator("#estado")).toContainText("sync cortado: 1 pendiente(s)", { timeout: 10_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("slice0-outbox") ?? "[]").length)).toBe(1);
  await page.unroute("**/api/sync/push");
  await page.click("#sync");
  await expect(page.locator("#estado")).toContainText("sync intentado (1)", { timeout: 10_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("slice0-outbox") ?? "[]").length)).toBe(0);
});
