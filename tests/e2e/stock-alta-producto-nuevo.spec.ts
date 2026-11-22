import { expect, test } from "@playwright/test";

// Regresion US 4: el catálogo sugerido se carga aunque la sesión no tenga
// crear_productos (igual que el alta por código desconocido en /venta).
test("catálogo sugerido visible sin crear_productos en stock", async ({ page }) => {
  await page.route("**/panel/stock", async (route) => {
    const respuesta = await route.fetch();
    // Si vuelve el gate de permiso, el HTML trae data-puede-crear="si" sin
    // sesión: lo forzamos a "no" para que la regresión se ponga roja.
    const html = (await respuesta.text()).replace('data-puede-crear="si"', 'data-puede-crear="no"');
    await route.fulfill({ response: respuesta, body: html });
  });
  await page.route("**/api/stock/plantilla", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ productos: ["Café sugerido"] }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/panel/stock");
  await expect(page.locator("#catalogo-sugerido")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#catalogo-sugerido-lista")).toContainText("Café sugerido");

  const codigo = `EAN-STOCK-${Date.now().toString(36)}`.toUpperCase().slice(0, 32);
  await page.fill("#lote-sku", codigo);
  await page.press("#lote-sku", "Enter");

  const estado = page.locator("#estado-lotes");
  await expect(estado).toContainText("No hay un producto con ese código", { timeout: 10_000 });
  await expect(estado.getByRole("button", { name: "Crear producto con este código" })).toBeVisible({ timeout: 10_000 });
});
