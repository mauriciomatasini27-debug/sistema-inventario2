import { expect, test } from "@playwright/test";

const preguntas = [
  { texto: "¿Cuánto vendí este mes?", herramienta: "ventas_periodo" },
  { texto: "¿Cómo vienen las ventas del mes?", herramienta: "ventas_periodo" },
  { texto: "¿Qué está por vencer?", herramienta: "por_vencer" },
  { texto: "¿Qué productos vencen pronto?", herramienta: "por_vencer" },
  { texto: "¿Quién me debe más?", herramienta: "deudores" },
  { texto: "¿Cómo está el fiado?", herramienta: "deudores" },
  { texto: "¿Qué productos tienen stock bajo?", herramienta: "stock_bajo" },
  { texto: "¿Qué me falta reponer?", herramienta: "stock_bajo" },
  { texto: "¿Cuánto hay en caja?", herramienta: "caja_dia" },
  { texto: "¿Cómo está la caja del día?", herramienta: "caja_dia" },
];

const cifras = [
  { etiqueta: "Total en caja", valor: "$ 2.500,00" },
  { etiqueta: "Efectivo", valor: "$ 2.500,00" },
];

function rutaFeliz(page: import("@playwright/test").Page) {
  return page.route("**/api/asistente", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: { incluido: true, explicacion: "", preguntas } })
      : r.fulfill({
          json: {
            texto: "Hay $ 2.500,00 en caja.",
            rechazada: false,
            herramienta: "caja_dia",
            cifras,
            reporte: { href: "/panel/caja", etiqueta: "caja" },
          },
        }),
  );
}

test("el drawer abre a la derecha en escritorio y responde un chip", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await rutaFeliz(page);
  await page.goto("/panel");
  await page.locator("#asistente-abrir").click();
  await expect(page.locator("#asistente-drawer")).toBeVisible();
  await expect(page.locator("[data-asistente-chip]")).toHaveCount(10);

  const caja = await page.locator("#asistente-drawer").boundingBox();
  expect(caja).not.toBeNull();
  expect(Math.round(caja!.width)).toBe(420);
  expect(Math.round(caja!.x + caja!.width)).toBe(1280);

  await page.getByRole("button", { name: "¿Cuánto hay en caja?" }).click();
  await expect(page.locator("#asistente-respuesta")).toHaveText("Hay $ 2.500,00 en caja.");
  await expect(page.locator("#asistente-cifras")).toContainText("$ 2.500,00");
  await expect(page.locator("#asistente-reporte")).toHaveText("Ver caja");
  await expect(page.locator("#asistente-reporte")).toHaveAttribute("href", "/panel/caja");
});

test("fuera de catálogo muestra la respuesta fija y resalta los chips", async ({ page }) => {
  await page.route("**/api/asistente", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: { incluido: true, explicacion: "", preguntas } })
      : r.fulfill({
          json: {
            texto: "Todavía no sé responder eso. Probá con una de las preguntas sugeridas.",
            rechazada: true,
            fueraDeCatalogo: true,
          },
        }),
  );
  await page.goto("/panel");
  await page.locator("#asistente-abrir").click();
  await page.getByRole("button", { name: "¿Quién me debe más?" }).click();
  await expect(page.locator("#asistente-respuesta")).toHaveText(
    "Todavía no sé responder eso. Probá con una de las preguntas sugeridas.",
  );
  await expect(page.locator("#asistente-chips-aviso")).toBeVisible();
  for (const chip of await page.locator("[data-asistente-chip]").all()) {
    await expect(chip).toHaveClass(/chip-resaltado/);
  }
});

test("Escape cierra el drawer y el foco vuelve al botón", async ({ page }) => {
  await rutaFeliz(page);
  await page.goto("/panel");
  await page.locator("#asistente-abrir").click();
  await expect(page.locator("#asistente-drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#asistente-drawer")).toBeHidden();
  await expect(page.locator("#asistente-abrir")).toBeFocused();
});

test("sin LLM configurado explica dentro del drawer", async ({ page }) => {
  await page.route("**/api/asistente", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: { incluido: true, explicacion: "", preguntas } })
      : r.fulfill({
          status: 503,
          json: { error: "El asistente IA todavía no está configurado.", codigo: "asistente_no_configurado" },
        }),
  );
  await page.goto("/panel");
  await page.locator("#asistente-abrir").click();
  await page.locator("#asistente-pregunta").fill("¿Cuánto vendí este mes?");
  await page.locator("#asistente-enviar").click();
  await expect(page.locator("#asistente-estado")).toHaveText("El asistente IA todavía no está configurado.");
});

test("plan sin asistente oculta el botón y explica", async ({ page }) => {
  await page.route("**/api/asistente", (r) =>
    r.fulfill({ json: { incluido: false, explicacion: "Tu plan no incluye el asistente IA.", preguntas: [] } }),
  );
  await page.goto("/panel");
  await expect(page.locator("#asistente-abrir")).toBeHidden();
  await expect(page.locator("#asistente-trigger-estado")).toHaveText("Tu plan no incluye el asistente IA.");
});

for (const tema of ["light", "dark"] as const) {
  test(`a 360 px ocupa todo el ancho sin desborde (${tema})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    await rutaFeliz(page);
    await page.goto("/panel");
    await page.locator("#asistente-abrir").click();
    await page.getByRole("button", { name: "¿Cuánto hay en caja?" }).click();
    await expect(page.locator("#asistente-cifras")).toContainText("$ 2.500,00");

    const caja = await page.locator("#asistente-drawer").boundingBox();
    expect(caja).not.toBeNull();
    expect(Math.round(caja!.width)).toBe(360);
    expect(Math.round(caja!.x)).toBe(0);

    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(0);
    await page.locator("#asistente-drawer").screenshot({ path: `test-results/dash-s7-360-${tema}.png` });
  });
}
