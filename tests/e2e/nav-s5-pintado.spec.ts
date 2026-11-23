import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

test("NAV-S5: las tarjetas no pagan blur y el layout queda igual", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tema", "claro"));
  await page.goto("/panel/caja");

  const tarjetas = page.locator(".panel-shell .card");
  await expect(tarjetas.first()).toBeVisible();

  const datos = await page.evaluate(() => {
    const cartas = [...document.querySelectorAll<HTMLElement>(".panel-shell .card")];
    const conBlur = cartas.filter((el) => getComputedStyle(el).backdropFilter !== "none");
    const barra = document.querySelector<HTMLElement>(".topbar-panel");
    const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminancia = (color: string) => {
      const [r = 0, g = 0, b = 0] = rgb(color).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contraste = (fondo: string, texto: string) => {
      const a = luminancia(fondo);
      const b = luminancia(texto);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const primera = cartas[0];
    const estilo = primera ? getComputedStyle(primera) : null;
    return {
      tarjetas: cartas.length,
      conBlur: conBlur.length,
      barra: barra ? getComputedStyle(barra).backdropFilter : "sin-barra",
      desborde: document.documentElement.scrollWidth - window.innerWidth,
      alto: document.documentElement.scrollHeight,
      contraste: estilo ? contraste(estilo.backgroundColor, estilo.color) : 0,
    };
  });

  expect(datos.tarjetas).toBeGreaterThanOrEqual(8);
  expect(datos.conBlur).toBe(0);
  expect(datos.barra).toContain("blur");
  expect(datos.desborde).toBeLessThanOrEqual(1);
  expect(datos.alto).toBeGreaterThan(600);
  expect(datos.contraste).toBeGreaterThanOrEqual(4.5);
});
