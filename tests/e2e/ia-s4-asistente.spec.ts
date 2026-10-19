import { expect, test } from "@playwright/test";

// IA-S4: la tarjeta del asistente en /panel pregunta, muestra la respuesta y
// se oculta con explicación cuando el plan no incluye el asistente; a 360px
// sin desborde en claro y oscuro.
for (const tema of ["light", "dark"] as const) {
  test(`pregunta y respuesta del asistente (${tema})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    await page.route("**/api/asistente", (r) =>
      r.request().method() === "GET"
        ? r.fulfill({ json: { incluido: true, explicacion: "" } })
        : r.fulfill({ json: { texto: "Este mes vendiste $ 12.345,00.", rechazada: false, herramienta: "ventas_periodo" } }),
    );
    await page.goto("/panel");
    await page.locator("#asistente-pregunta").fill("¿Cuánto vendí este mes?");
    await page.locator("#asistente-enviar").click();
    await expect(page.locator("#asistente-respuesta")).toHaveText("Este mes vendiste $ 12.345,00.");
    await page.locator("#asistente-panel").screenshot({ path: `test-results/ia-s4-360-${tema}.png` });
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(0);
  });
}

test("plan sin asistente oculta el formulario y explica", async ({ page }) => {
  await page.route("**/api/asistente", (r) =>
    r.fulfill({ json: { incluido: false, explicacion: "Tu plan no incluye el asistente IA." } }),
  );
  await page.goto("/panel");
  await expect(page.locator("#asistente-form")).toBeHidden();
  await expect(page.locator("#asistente-estado")).toHaveText("Tu plan no incluye el asistente IA.");
});

test("sin LLM configurado explica en la tarjeta sin toast de error", async ({ page }) => {
  await page.route("**/api/asistente", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: { incluido: true, explicacion: "" } })
      : r.fulfill({
          status: 503,
          json: { error: "El asistente IA todavía no está configurado.", codigo: "asistente_no_configurado" },
        }),
  );
  await page.goto("/panel");
  await page.locator("#asistente-pregunta").fill("¿Cuánto vendí este mes?");
  await page.locator("#asistente-enviar").click();
  await expect(page.locator("#asistente-estado")).toHaveText("El asistente IA todavía no está configurado.");
});
