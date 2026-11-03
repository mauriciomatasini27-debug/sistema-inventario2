import { expect, test, type Page } from "@playwright/test";

const CORE = [
  { id: "dashboard", label: "Dashboard", href: "/panel" },
  { id: "ventas", label: "Ventas", href: "/venta" },
  { id: "caja", label: "Caja", href: "/panel/caja" },
  { id: "stock", label: "Stock", href: "/panel/stock" },
  { id: "precios", label: "Precios", href: "/panel/precios" },
  { id: "proveedores", label: "Proveedores", href: "/panel/proveedores" },
  { id: "consumos", label: "Consumos", href: "/panel/consumos" },
  { id: "fiado", label: "Fiado", href: "/panel/fiado" },
  { id: "reportes", label: "Reportes", href: "/panel/reportes" },
];

const BOT = { id: "bot", label: "Bot", href: "/panel/bot/config" };
const ALERTAS = { id: "alertas", label: "Alertas", href: "/panel/alertas/umbrales" };
const ASISTENTE = { id: "asistente", label: "Asistente", href: "#asistente" };

const SIN_BOT_NI_ASISTENTE = [...CORE, ALERTAS];
const TODO = [...CORE, BOT, ALERTAS, ASISTENTE];

function indice(page: Page, modulos: ReadonlyArray<{ id: string }>) {
  return page.route("**/api/panel/indice", (r) => r.fulfill({ json: { modulos } }));
}

function asistenteIncluido(page: Page) {
  return page.route("**/api/asistente", (r) =>
    r.fulfill({ json: { incluido: true, explicacion: "", preguntas: [] } }),
  );
}

test("sin bot ni asistente en el índice oculta Bot y deja el botón del asistente al API", async ({ page }) => {
  await indice(page, SIN_BOT_NI_ASISTENTE);
  await asistenteIncluido(page);
  await page.goto("/panel");

  await expect(page.locator('#bot[data-modulo-indice="bot"]')).toBeHidden();
  await expect(page.locator('nav.pills a[data-modulo-indice="bot"]')).toBeHidden();
  await expect(page.locator("#asistente-abrir")).toBeVisible();
  await expect(page.locator('#alertas[data-modulo-indice="alertas"]')).toBeVisible();
  await expect(page.locator('nav.pills a[data-modulo-indice="alertas"]')).toBeVisible();
});

test("con todo encendido aparecen Bot, Alertas y Asistente", async ({ page }) => {
  await indice(page, TODO);
  await asistenteIncluido(page);
  await page.goto("/panel");

  await expect(page.locator('#bot[data-modulo-indice="bot"]')).toBeVisible();
  await expect(page.locator('nav.pills a[data-modulo-indice="bot"]')).toBeVisible();
  await expect(page.locator('#alertas[data-modulo-indice="alertas"]')).toBeVisible();
  await expect(page.locator('nav.pills a[data-modulo-indice="alertas"]')).toBeVisible();
  await expect(page.locator("#asistente-abrir")).toBeVisible();
});

test("en /panel/caja el índice oculta la pill Bot y deja Alertas", async ({ page }) => {
  await indice(page, SIN_BOT_NI_ASISTENTE);
  await page.goto("/panel/caja");

  await expect(page.locator('nav.pills a[data-modulo-indice="bot"]')).toBeHidden();
  await expect(page.locator('nav.pills a[data-modulo-indice="alertas"]')).toBeVisible();
  await expect(page.locator('nav.pills a[data-modulo-indice="caja"]')).toBeVisible();
});

test("si el índice falla en /panel/caja las pills siguen visibles", async ({ page }) => {
  await page.route("**/api/panel/indice", (r) => r.fulfill({ status: 500, json: { error: "falló" } }));
  await page.goto("/panel/caja");

  await expect(page.locator('nav.pills a[data-modulo-indice="bot"]')).toBeVisible();
  await expect(page.locator('nav.pills a[data-modulo-indice="alertas"]')).toBeVisible();
});

test("si el índice falla el panel muestra todos los módulos", async ({ page }) => {
  await page.route("**/api/panel/indice", (r) => r.fulfill({ status: 500, json: { error: "falló" } }));
  await asistenteIncluido(page);
  await page.goto("/panel");

  await expect(page.locator('#bot[data-modulo-indice="bot"]')).toBeVisible();
  await expect(page.locator('nav.pills a[data-modulo-indice="bot"]')).toBeVisible();
  await expect(page.locator('#alertas[data-modulo-indice="alertas"]')).toBeVisible();
  await expect(page.locator("#asistente-abrir")).toBeVisible();
});

for (const ancho of [360, 1280] as const) {
  for (const tema of ["light", "dark"] as const) {
    test(`índice a ${ancho} px sin desborde (${tema})`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.emulateMedia({ colorScheme: tema });
      await indice(page, TODO);
      await asistenteIncluido(page);
      await page.goto("/panel");
      await expect(page.locator('#bot[data-modulo-indice="bot"]')).toBeVisible();

      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(desborde).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `test-results/dash-s12-${ancho}-${tema}.png`,
        fullPage: true,
      });
    });
  }
}
