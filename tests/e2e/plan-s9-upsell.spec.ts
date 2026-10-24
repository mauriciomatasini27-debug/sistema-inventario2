import { expect, test, type Page } from "@playwright/test";

const PANTALLA_ASISTENTE = {
  superficie: "asistente",
  titulo: "Asistente IA en Plus",
  queHace: "Preguntale al negocio por ventas, stock y movimientos en tus palabras.",
  planActualId: "basico",
  planActualNombre: "Básico",
  planActualTexto: "Tu plan actual es Básico.",
  planDelModuloId: "plus",
  planDelModuloNombre: "Plus",
  planModuloTexto: "Está en el plan Plus.",
  cta: "ver_planes",
  reemplazaPagina: true,
};

function indiceBasico(page: Page) {
  return page.route("**/api/panel/indice", (r) =>
    r.fulfill({
      json: {
        modulos: [
          { id: "dashboard", label: "Dashboard", href: "/panel" },
          { id: "bot", label: "Bot", href: "/panel/bot/config" },
          { id: "alertas", label: "Alertas", href: "/panel/alertas/umbrales" },
        ],
        upsell: [],
        rol: "dueno",
      },
    }),
  );
}

test("Básico abre el drawer y ve qué hace, el plan actual y Ver planes", async ({ page }) => {
  await indiceBasico(page);
  await page.route("**/api/asistente", (r) =>
    r.fulfill({
      json: {
        incluido: false,
        explicacion: "Tu plan no incluye el asistente IA.",
        preguntas: [],
        upsell: PANTALLA_ASISTENTE,
      },
    }),
  );
  await page.goto("/panel");
  await page.locator("#asistente-abrir").click();
  const upsell = page.locator("#asistente-upsell");
  await expect(upsell).toBeVisible();
  await expect(upsell).toContainText(PANTALLA_ASISTENTE.queHace);
  await expect(upsell).toContainText("Tu plan actual es Básico.");
  await expect(upsell).toContainText("Está en el plan Plus.");
  await expect(upsell.getByRole("link", { name: "Ver planes" })).toHaveAttribute("href", "/panel/plan");
  await expect(page.locator("#asistente-chat")).toBeHidden();
});

test("el empleado ve el pedido al Dueño y no el link de planes", async ({ page }) => {
  await indiceBasico(page);
  await page.route("**/api/asistente", (r) =>
    r.fulfill({
      json: {
        incluido: false,
        explicacion: "Tu plan no incluye el asistente IA.",
        preguntas: [],
        upsell: { ...PANTALLA_ASISTENTE, cta: "pedile_al_dueno" },
      },
    }),
  );
  await page.goto("/panel");
  await page.locator("#asistente-abrir").click();
  await expect(page.locator("#asistente-upsell")).toContainText("Pedile al Dueño que lo active");
  await expect(page.locator("[data-asistente-upsell-ver]")).toBeHidden();
});

test("bot fuera de plan muestra upsell y no el formulario", async ({ page }) => {
  await page.route("**/api/panel/upsell**", (r) =>
    r.fulfill({
      json: {
        acceso: "upsell",
        pantalla: {
          superficie: "bot",
          titulo: "Bot de WhatsApp en Plus",
          queHace: "Consultá stock y movimientos por WhatsApp, sin abrir el panel.",
          planActualId: "basico",
          planActualNombre: "Básico",
          planActualTexto: "Tu plan actual es Básico.",
          planDelModuloId: "plus",
          planDelModuloNombre: "Plus",
          planModuloTexto: "Está en el plan Plus.",
          cta: "ver_planes",
          reemplazaPagina: true,
        },
      },
    }),
  );
  await page.goto("/panel/bot/config");
  await expect(page.locator("[data-upsell-pantalla]")).toContainText("Tu plan actual es Básico.");
  await expect(page.locator("[data-upsell-pantalla]")).toContainText(
    "Consultá stock y movimientos por WhatsApp, sin abrir el panel.",
  );
  await expect(page.getByRole("link", { name: "Ver planes" })).toBeVisible();
  await expect(page.locator("[data-modulo-cuerpo]")).toBeHidden();
});

test("alertas de WhatsApp fuera de plan dejan los umbrales de mail", async ({ page }) => {
  await page.route("**/api/panel/upsell**", (r) =>
    r.fulfill({
      json: {
        acceso: "upsell",
        pantalla: {
          superficie: "alertas_whatsapp",
          titulo: "Alertas por WhatsApp en Plus",
          queHace: "Avisos de stock bajo por WhatsApp y el resumen de la mañana.",
          planActualId: "basico",
          planActualNombre: "Básico",
          planActualTexto: "Tu plan actual es Básico.",
          planDelModuloId: "plus",
          planDelModuloNombre: "Plus",
          planModuloTexto: "Está en el plan Plus.",
          cta: "ver_planes",
          reemplazaPagina: false,
        },
      },
    }),
  );
  await page.goto("/panel/alertas/umbrales");
  await expect(page.locator("[data-upsell-pantalla]")).toContainText("Alertas por WhatsApp en Plus");
  await expect(page.locator("[data-modulo-cuerpo]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Umbrales de alerta" })).toBeVisible();
});
