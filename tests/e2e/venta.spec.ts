import { expect, test, type Page } from "@playwright/test";

async function largoOutbox(page: Page): Promise<number> {
  return page.evaluate(() => {
    const tenant = document.querySelector("[data-tenant]")?.getAttribute("data-tenant")?.trim() ?? "";
    const clave = tenant ? `slice0-outbox:${tenant}` : "slice0-outbox";
    return JSON.parse(localStorage.getItem(clave) ?? "[]").length;
  });
}

// Slice-0 E2E (ADR-0017): /venta a 360px. Cobro feliz online + corte de red con
// provisorio DeviceCode-SeqLocal y reintento sin duplicar (mismo op_id).
test("cobro feliz crea ticket definitivo y balance cuadra", async ({ page }) => {
  await page.goto("/venta");
  await page.fill("#sku", "demo-sku-1");
  await page.fill("#qty", "1");
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito")).toContainText("demo-sku-1", { timeout: 10_000 });
  await page.click("#cobrar");
  await expect(page.locator("#paso-cobro")).toBeVisible();
  await page.selectOption("#medio", "Efectivo");
  await page.click("#confirmar-cobro");
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
  await page.click("#confirmar-cobro");
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
  await expect(page.locator("#precio")).toHaveValue("9,99");
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito .monto")).toHaveText("$9.99");

  await context.setOffline(true);
  await page.fill("#sku", "demo-sku-2");
  await page.fill("#sku", "demo-sku-1");
  await expect(page.locator("#precio")).toHaveValue("9,99");
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
  await page.fill("#precio", "5,00");
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito")).toContainText("demo-sku-2", { timeout: 10_000 });
  await expect(page.locator("#lista-carrito .monto")).toHaveText("$10.00");
  await page.click("#cobrar");
  await page.click("#confirmar-cobro");
  await expect(page.locator("#estado")).toContainText("provisorio", { timeout: 10_000 });
});

// VF-S2 (ADR-0097): si el push falla, la venta encolada no se borra.
test("sync con push caído deja la venta en la cola y la sube después", async ({ page, context }) => {
  await page.goto("/venta");
  // device_seq nuevo: el servidor de dev ya vio seq bajos de "caja-01" en los otros tests (422).
  await page.evaluate(() => {
    const tenant = document.querySelector("[data-tenant]")?.getAttribute("data-tenant")?.trim() ?? "";
    const seq = tenant ? `slice0-seq:${tenant}` : "slice0-seq";
    const box = tenant ? `slice0-outbox:${tenant}` : "slice0-outbox";
    localStorage.removeItem(box);
    localStorage.setItem(seq, String(Date.now()));
  });
  await context.setOffline(true);
  await page.fill("#sku", "demo-sku-1");
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito")).toContainText("demo-sku-1", { timeout: 10_000 });
  await page.click("#cobrar");
  await page.click("#confirmar-cobro");
  await expect(page.locator("#estado")).toContainText("provisorio", { timeout: 10_000 });
  await page.route("**/api/sync/push", (route) => route.abort("failed"));
  await context.setOffline(false);
  await expect(page.locator("#estado")).toContainText("sync cortado: 1 pendiente(s)", { timeout: 10_000 });
  expect(await largoOutbox(page)).toBe(1);
  await page.unroute("**/api/sync/push");
  await page.click("#sync");
  await expect(page.locator("#estado")).toContainText("sync intentado (1)", { timeout: 10_000 });
  expect(await largoOutbox(page)).toBe(0);
});

test("buscador, ticket y volver conservan líneas y total", async ({ page }) => {
  await page.route("**/api/products?**", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    const productos = q.toLowerCase().includes("alf")
      ? [{ sku: "ALF-1", nombre: "Alfajor", precioCentavos: 90000 }]
      : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ productos }),
    });
  });
  await page.goto("/venta");
  await expect(page.locator("#resultados")).toBeHidden();
  await expect(page.locator("#cobrar")).toBeDisabled();
  await expect(page.locator("#cobrar")).toHaveClass(/cobrar-apagado/);
  await expect(page.locator("#cobrar")).not.toHaveClass(/sg-flame-cta/);
  const fondoApagado = await page.locator("#cobrar").evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect(page.locator("#ticket-vacio")).toBeVisible();
  await expect(page.locator("#leer-camara")).toContainText("Escanear");
  const escanear = await page.locator("#leer-camara").boundingBox();
  expect(escanear?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(escanear?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.fill("#sku", "zzz-sin-producto");
  await expect(page.locator("#resultados")).toContainText("Sin coincidencias", { timeout: 10_000 });
  await expect(page.locator("#lista-carrito li")).toHaveCount(0);

  await page.fill("#sku", "alf");
  await expect(page.locator("#resultados")).toContainText("Alfajor", { timeout: 10_000 });
  await page.locator("#resultados button").click();
  await expect(page.locator("#lista-carrito")).toContainText("Alfajor");
  await expect(page.locator("#lista-carrito .monto")).toHaveText("$900.00");

  await page.fill("#sku", "demo-sku-1");
  await page.fill("#qty", "1");
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito .qty").nth(1)).toHaveText("1", { timeout: 10_000 });
  await page.press("#sku", "Enter");
  await expect(page.locator("#lista-carrito .qty").nth(1)).toHaveText("2");
  await expect(page.locator("#lista-carrito")).toContainText("demo-sku-1");
  const lineas = await page.locator("#lista-carrito li").count();
  expect(lineas).toBe(2);

  const menos = page.getByRole("button", { name: "Bajar cantidad demo-sku-1" });
  const caja = await menos.boundingBox();
  expect(caja?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
  await menos.click();
  await menos.click();
  await expect(page.locator("#lista-carrito")).not.toContainText("demo-sku-1");

  const total = await page.locator("#carrito-total").innerText();
  await expect(page.locator("#cobrar")).toBeEnabled();
  await expect(page.locator("#cobrar")).toHaveClass(/sg-flame-cta/);
  await expect.poll(() => page.locator("#cobrar").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(fondoApagado);
  await page.click("#cobrar");
  await expect(page.locator("#paso-cobro")).toBeVisible();
  await expect(page.locator("#paso-ticket")).toBeHidden();
  await expect(page.locator("#cobro-total")).toHaveText(total);
  await page.click("#volver-ticket");
  await expect(page.locator("#paso-ticket")).toBeVisible();
  await expect(page.locator("#paso-cobro")).toBeHidden();
  await expect(page.locator("#lista-carrito")).toContainText("Alfajor");
  await expect(page.locator("#carrito-total")).toHaveText(total);

  await page.fill("#sku", "codigo-que-no-esta");
  await page.press("#sku", "Enter");
  await expect(page.locator("#estado")).toContainText("No hay un producto con ese código.", { timeout: 10_000 });
  await expect(page.locator("#alta-nombre-label")).toBeVisible();
});
