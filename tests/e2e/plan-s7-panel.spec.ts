import { expect, test } from "@playwright/test";
import { vistaPlan } from "../../src/lib/plan-panel.js";
import { PLANES_EJEMPLO } from "../../src/modules/planes/catalogo.js";
import { parseFechaAR } from "../../src/lib/fecha-ar.js";

// PLAN-S7: el Dueño ve renovación, cupo de WhatsApp con número y texto y los
// botones de cambio; subir explica que falta el cobro; a 360px sin desborde.
const basico = vistaPlan({
  planId: "basico",
  catalogo: PLANES_EJEMPLO,
  consultasAsistenteMes: 0,
  mensajesWhatsappMes: 42,
  hoy: parseFechaAR("2026-10-18")!,
  renovacion: parseFechaAR("2026-11-18"),
});

for (const tema of ["light", "dark"] as const) {
  test(`renovación, cupo de WhatsApp y botones (${tema})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    await page.route("**/api/plan/resumen", (r) => r.fulfill({ json: basico }));
    await page.goto("/panel/plan");
    await expect(page.locator("#plan-renovacion")).toHaveText("Se renueva el 18/11/2026.");
    await expect(page.locator("#whatsapp-texto")).toHaveText(
      "Usaste 42 de 100 consultas por WhatsApp este mes · quedan 58",
    );
    await expect(page.locator("#whatsapp-medidor")).toHaveAttribute("aria-valuenow", "42");
    await expect(page.locator("#plan-botones button")).toHaveText(["Cambiar a Plus", "Cambiar a Pro"]);
    await page.screenshot({ path: `test-results/plan-s7-360-${tema}.png`, fullPage: true });
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(0);
  });
}

test("subir de plan explica que falta el cobro", async ({ page }) => {
  await page.route("**/api/plan/resumen", (r) => r.fulfill({ json: basico }));
  await page.route("**/api/plan/cambiar", (r) => r.fulfill({ status: 409, json: { error: "requiere_cobro" } }));
  await page.goto("/panel/plan");
  await page.locator("#plan-botones button", { hasText: "Cambiar a Plus" }).click();
  await expect(page.locator("#plan-accion-estado")).toHaveText(
    "Subir de plan necesita el cobro, que todavía no está disponible.",
  );
  await expect(page.locator("#plan-botones button").first()).toBeEnabled();
});
