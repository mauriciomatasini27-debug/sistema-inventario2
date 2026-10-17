import { expect, test, type Page, type Route } from "@playwright/test";

// DS-S12/DS-S17: mientras cargan los KPI de /panel hay skeleton con shimmer y
// aria-busy; al llegar los datos, valores y aria-busy="false". Con movimiento
// reducido el skeleton queda estático.
const RESUMEN = { tickets_hoy: 3, stock_bajo: 1, por_medio: [{ medio: "Efectivo", centavos: "1000" }] };
const BALANCE = { por_medio: { Efectivo: "1000" } };

/** Retiene las dos fuentes de la franja hasta que el test las suelte. */
async function retener(page: Page): Promise<() => Promise<void>> {
  const pendientes: Array<() => Promise<void>> = [];
  const colgar = (cuerpo: object) => (route: Route) => {
    pendientes.push(() => route.fulfill({ json: cuerpo }));
  };
  await page.route("**/api/sales/resumen", colgar(RESUMEN));
  await page.route("**/api/cash/balance", colgar(BALANCE));
  return async () => {
    await expect.poll(() => pendientes.length).toBe(2);
    await Promise.all(pendientes.map((f) => f()));
  };
}

const animacion = (page: Page) =>
  page.locator("#n-tickets .skel").evaluate((el) => getComputedStyle(el).animationName);

for (const tema of ["claro", "oscuro"] as const) {
  test.describe(`skeleton KPI con movimiento (${tema})`, () => {
    test.use({ reducedMotion: "no-preference", colorScheme: tema === "oscuro" ? "dark" : "light" });

    test("carga con shimmer y aria-busy, después valores", async ({ page }) => {
      const soltar = await retener(page);
      await page.goto("/panel");
      await expect(page.locator("html")).toHaveAttribute("data-tema", tema);
      const strip = page.locator("#kpi-strip");
      await expect(strip).toHaveAttribute("aria-busy", "true");
      await expect(page.locator("#kpi-strip .skel")).toHaveCount(4);
      expect(await animacion(page)).toBe("kpi-shimmer");
      await soltar();
      await expect(strip).toHaveAttribute("aria-busy", "false");
      await expect(page.locator("#n-tickets")).toHaveText("3");
      await expect(page.locator("#n-stock")).toHaveText("1");
      await expect(page.locator("#segbar")).toHaveText("100% Efectivo");
      await expect(page.locator("#kpi-strip .skel")).toHaveCount(0);
      await expect(page.locator("#kpi-strip .bignum.listo")).toHaveCount(3);
    });
  });
}

test.describe("skeleton KPI con movimiento reducido", () => {
  test.use({ reducedMotion: "reduce" });

  test("skeleton estático y valores sin entrada animada", async ({ page }) => {
    const soltar = await retener(page);
    await page.goto("/panel");
    await expect(page.locator("#kpi-strip")).toHaveAttribute("aria-busy", "true");
    expect(await animacion(page)).toBe("none");
    await soltar();
    await expect(page.locator("#kpi-strip")).toHaveAttribute("aria-busy", "false");
    const entradas = await page
      .locator("#kpi-strip .bignum.listo")
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect(entradas).toEqual(["none", "none", "none"]);
  });
});

test("si el servidor falla, la franja sale de carga con — y Sin datos", async ({ page }) => {
  await page.route("**/api/sales/resumen", (r) => r.fulfill({ status: 500, body: "x" }));
  await page.route("**/api/cash/balance", (r) => r.fulfill({ status: 500, body: "x" }));
  await page.goto("/panel");
  await expect(page.locator("#kpi-strip")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#n-tickets")).toHaveText("—");
  await expect(page.locator("#n-caja")).toHaveText("—");
  await expect(page.locator("#segbar")).toHaveText("Sin datos");
});
