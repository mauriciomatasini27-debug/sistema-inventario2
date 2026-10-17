import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __primerFrame?: { tema: string | undefined; fondo: string } | null;
  }
}

// DS-S4/S6: tema claro/oscuro por dispositivo con toggle y sin flash.
const RUTAS = ["/venta", "/panel", "/panel/stock"];

for (const ruta of RUTAS) {
  test.describe(`tema guardado sin flash en ${ruta}`, () => {
    test.use({ colorScheme: "light" });
    // Por qué "oscuro" con el sistema en claro: sin el script inline la página
    // arrancaría clara, así que el test solo pasa si el tema se aplica antes de pintar.
    test("sin flash: el primer frame ya tiene el tema guardado", async ({ page }) => {
      await page.addInitScript(() => {
        try {
          localStorage.setItem("tema", "oscuro");
        } catch {
          // sin storage; el resto del test no aplica
        }
        window.__primerFrame = null;
        const capturar = () => {
          if (!document.body) {
            requestAnimationFrame(capturar);
            return;
          }
          window.__primerFrame = {
            tema: document.documentElement.dataset.tema,
            fondo: getComputedStyle(document.body).backgroundColor,
          };
        };
        requestAnimationFrame(capturar);
      });
      await page.goto(ruta);
      await page.waitForFunction(() => window.__primerFrame != null);
      const frame = await page.evaluate(() => window.__primerFrame);
      expect(frame?.tema).toBe("oscuro");
      expect(frame?.fondo).toBe("rgb(26, 26, 26)");
    });
  });

  test.describe(`tema claro/oscuro en ${ruta}`, () => {
    test.use({ colorScheme: "dark" });

    test("sin elección guardada arranca en oscuro (sigue al sistema)", async ({ page }) => {
      await page.goto(ruta);
      await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
    });

    test("el toggle cambia el tema, aria-pressed y persiste tras recargar", async ({ page }) => {
      await page.goto(ruta);
      const toggle = page.locator("button[data-tema-toggle]").first();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await toggle.click();
      await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
      await expect(page.locator("button[data-tema-toggle]").first()).toHaveAttribute("aria-pressed", "false");
    });

    test("el toggle responde al teclado (foco + Enter)", async ({ page }) => {
      await page.goto(ruta);
      const toggle = page.locator("button[data-tema-toggle]").first();
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
    });

    test("el toggle mide al menos 44x44", async ({ page }) => {
      await page.goto(ruta);
      const caja = await page.locator("button[data-tema-toggle]").first().boundingBox();
      expect(caja?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
    });

  });
}
