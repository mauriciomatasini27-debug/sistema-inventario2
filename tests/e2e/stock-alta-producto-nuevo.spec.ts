import { expect, test } from "@playwright/test";

// Regresion: el mismo mensaje de código desconocido en /panel/stock debe ofrecer
// el alta aunque la sesion no tenga crear_productos (igual que en /venta).
test("codigo desconocido ofrece alta en stock sin crear_productos", async ({ page }) => {
  const codigo = `EAN-STOCK-${Date.now().toString(36)}`.toUpperCase().slice(0, 32);
  await page.route("**/panel/stock", async (route) => {
    const respuesta = await route.fetch();
    const html = (await respuesta.text()).replace('data-puede-crear="si"', 'data-puede-crear="no"');
    await route.fulfill({ response: respuesta, body: html });
  });

  await page.goto("/panel/stock");
  await expect(page.locator("#catalogo-sugerido")).toHaveAttribute("data-puede-crear", "no");

  await page.fill("#lote-sku", codigo);
  await page.press("#lote-sku", "Enter");

  const estado = page.locator("#estado-lotes");
  await expect(estado).toContainText("No hay un producto con ese código", { timeout: 10_000 });
  await expect(estado.getByRole("button", { name: "Crear producto con este código" })).toBeVisible({ timeout: 10_000 });
});
