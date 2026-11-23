import { expect, test } from "@playwright/test";

// Regresion: un codigo desconocido debe poder darse de alta y cobrarse desde
// /venta incluso cuando la sesion no tiene crear_productos (riesgo reportado:
// el visor escanea, el codigo queda en Buscar, pero no hay UI de alta ni cobro).
test("code desconocido ofrece alta y permite cobrar sin crear_productos", async ({ page }) => {
  const codigo = `EAN-NUEVO-${Date.now().toString(36)}`.toUpperCase().slice(0, 32);
  await page.route("**/venta", async (route) => {
    const respuesta = await route.fetch();
    const html = (await respuesta.text()).replace('data-crear-productos="si"', 'data-crear-productos="no"');
    await route.fulfill({ response: respuesta, body: html });
  });

  await page.goto("/venta");
  await expect(page.locator("body")).toHaveAttribute("data-crear-productos", "no");

  await page.fill("#sku", codigo);
  await page.press("#sku", "Enter");
  await expect(page.locator("#alta-nombre-label")).toBeVisible();
  await expect(page.locator("#alta-nombre")).toBeFocused();

  await page.fill("#alta-nombre", "Producto nuevo de prueba");
  await page.fill("#precio", "1500");
  await page.press("#alta-nombre", "Enter");
  await expect(page.locator("#lista-carrito")).toContainText("Producto nuevo de prueba");
  await expect(page.locator("#cobrar")).toBeEnabled();

  await page.click("#cobrar");
  await page.selectOption("#medio", "Efectivo");
  await page.click("#confirmar-cobro");
  await expect(page.locator("#estado")).toContainText("T-", { timeout: 10_000 });
});
