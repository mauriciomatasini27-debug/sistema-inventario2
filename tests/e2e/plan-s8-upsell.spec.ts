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
const SIN_ASISTENTE = [...CORE, BOT, ALERTAS];

const OFERTA = {
  modulo: "asistente",
  titulo: "Asistente IA en Plus",
  texto: "Preguntale al negocio por ventas, stock y movimientos en tus palabras.",
  planId: "plus",
  planNombre: "Plus",
};

const CLAVE_DESCARTES = "panel:upsell-descartes";

type Indice = {
  modulos: ReadonlyArray<{ id: string }>;
  upsell: ReadonlyArray<typeof OFERTA>;
  rol: "dueno" | "empleado";
};

function indice(page: Page, datos: Indice) {
  return page.route("**/api/panel/indice", (r) => r.fulfill({ json: datos }));
}

function asistenteIncluido(page: Page) {
  return page.route("**/api/asistente", (r) =>
    r.fulfill({ json: { incluido: true, explicacion: "", preguntas: [] } }),
  );
}

function basico(rol: "dueno" | "empleado" = "dueno"): Indice {
  return { modulos: SIN_ASISTENTE, upsell: [OFERTA], rol };
}

function esperarIndice(page: Page) {
  return page.waitForResponse((r) => r.url().includes("/api/panel/indice"));
}

test("Básico muestra la tarjeta del asistente con Ver planes hacia /panel/plan", async ({ page }) => {
  await indice(page, basico());
  await asistenteIncluido(page);
  await page.goto("/panel");

  const card = page.locator("[data-upsell]");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "Asistente IA en Plus" })).toBeVisible();
  const link = card.locator("[data-upsell-link]");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/panel/plan");
  await expect(link).toHaveText("Ver planes");
  await expect(card.locator("[data-upsell-empleado]")).toBeHidden();
});

test("Ahora no oculta la tarjeta y no vuelve al recargar", async ({ page }) => {
  await indice(page, basico());
  await asistenteIncluido(page);
  await page.goto("/panel");

  const card = page.locator("[data-upsell]");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Ahora no" }).click();
  await expect(card).toBeHidden();

  const respuesta = esperarIndice(page);
  await page.reload();
  await respuesta;
  await expect(card).toBeHidden();
});

test("un descarte de hace 31 días vuelve a mostrar la tarjeta", async ({ page }) => {
  await page.addInitScript(
    ({ clave, valor }) => {
      localStorage.setItem(clave, JSON.stringify(valor));
    },
    { clave: CLAVE_DESCARTES, valor: { asistente: Date.now() - 31 * 24 * 60 * 60 * 1000 } },
  );
  await indice(page, basico());
  await asistenteIncluido(page);
  await page.goto("/panel");

  await expect(page.locator("[data-upsell]")).toBeVisible();
  await expect(
    page.locator("[data-upsell]").getByRole("heading", { name: "Asistente IA en Plus" }),
  ).toBeVisible();
});

test("un empleado no recibe el link y sí el texto para pedírselo al Dueño", async ({ page }) => {
  await indice(page, basico("empleado"));
  await asistenteIncluido(page);
  await page.goto("/panel");

  const card = page.locator("[data-upsell]");
  await expect(card).toBeVisible();
  await expect(card.locator("[data-upsell-link]")).toBeHidden();
  await expect(card.locator("[data-upsell-empleado]")).toBeVisible();
  await expect(card.locator("[data-upsell-empleado]")).toHaveText("Pedile al Dueño que lo active");
});

test("un plan con todo no muestra tarjeta", async ({ page }) => {
  await indice(page, { modulos: [...SIN_ASISTENTE, { id: "asistente", label: "Asistente", href: "#asistente" }], upsell: [], rol: "dueno" });
  await asistenteIncluido(page);
  const respuesta = esperarIndice(page);
  await page.goto("/panel");
  await respuesta;

  await expect(page.locator("[data-upsell]")).toBeHidden();
});

test("si la ruta del índice falla no muestra tarjeta", async ({ page }) => {
  await page.route("**/api/panel/indice", (r) =>
    r.fulfill({ status: 500, json: { error: "falló" } }),
  );
  await asistenteIncluido(page);
  const respuesta = esperarIndice(page);
  await page.goto("/panel");
  await respuesta;

  await expect(page.locator("[data-upsell]")).toBeHidden();
});

for (const ancho of [360, 1280] as const) {
  for (const tema of ["light", "dark"] as const) {
    test(`upsell a ${ancho} px sin desborde (${tema})`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.emulateMedia({ colorScheme: tema });
      await indice(page, basico());
      await asistenteIncluido(page);
      await page.goto("/panel");
      await expect(page.locator("[data-upsell]")).toBeVisible();

      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(desborde).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `test-results/plan-s8-${ancho}-${tema}.png`,
        fullPage: true,
      });
    });
  }
}
