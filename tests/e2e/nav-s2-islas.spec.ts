import { expect, test, type Page } from "@playwright/test";

type Liberar = () => void;

async function retenerIslas(page: Page): Promise<Liberar> {
  let liberar: Liberar = () => {};
  const retenido = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  await page.route("**/_server-islands/**", async (route) => {
    await retenido;
    await route.continue();
  });
  return liberar;
}

test("NAV-S2: /panel/integraciones muestra el shell antes de la salud de Gmail", async ({ page }) => {
  const liberar = await retenerIslas(page);
  await page.goto("/panel/integraciones", { waitUntil: "commit" });

  await expect(page.locator("#gmail-skeleton")).toBeVisible();
  liberar();

  await expect(page.locator("#salud-gmail")).toBeVisible();
  await expect(page.locator("#gmail-skeleton")).toHaveCount(0);
  await expect(page.locator("#form-gmail")).toBeVisible();
  await expect(page.locator("#form-gmail")).toHaveAttribute("data-dueno", "0");
  // El script de la isla corre después de insertar el HTML: sin sesión de
  // Dueño, /api/panel/indice responde 403 y el checkbox queda deshabilitado.
  await expect(page.locator("#acepto-gmail")).toBeDisabled();
});

test("NAV-S2: /panel/integraciones-remitentes muestra el shell antes de la lista", async ({ page }) => {
  const liberar = await retenerIslas(page);
  await page.goto("/panel/integraciones-remitentes", { waitUntil: "commit" });

  await expect(page.locator("#remitentes-skeleton")).toBeVisible();
  liberar();

  await expect(page.locator("section.card h2", { hasText: "Remitentes configurados" })).toBeVisible();
  await expect(page.locator("#remitentes-skeleton")).toHaveCount(0);
});
