import { expect, test, type Page, type Route } from "@playwright/test";

type Liberar = () => Promise<void>;

/** Retiene las rutas que matchean hasta que el test las libera. */
async function retener(page: Page, patron: string | RegExp, responder: (route: Route) => Promise<void> | void): Promise<{ liberar: Liberar; vistos: () => number }> {
  let vistos = 0;
  let liberarTodas = () => {};
  const listo = new Promise<void>((resolve) => {
    liberarTodas = resolve;
  });
  await page.route(patron, async (route) => {
    vistos += 1;
    await listo;
    await responder(route);
  });
  return {
    vistos: () => vistos,
    liberar: async () => {
      liberarTodas();
    },
  };
}

const json = (route: Route, cuerpo: object) => route.fulfill({ json: cuerpo });

test("NAV-S3: caja muestra skeleton antes de las cinco respuestas", async ({ page }) => {
  const retenido = await retener(page, "**/api/cash/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/balance")) return json(route, { por_medio: { Efectivo: "1000" } });
    if (url.pathname.endsWith("/history")) return json(route, { items: [] });
    if (url.pathname.endsWith("/due-items")) return json(route, { vencimientos: [] });
    if (url.pathname.endsWith("/close")) return route.fulfill({ status: 404, body: "" });
    if (url.pathname.endsWith("/qr")) return json(route, { recibos: [] });
    return json(route, {});
  });

  await page.goto("/panel/caja");
  await expect(page.locator("#saldo-caja")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#caja-total .skel")).toBeVisible();
  await expect(page.locator("#mov-body .skel").first()).toBeVisible();
  await expect(page.locator("#venc-lista .skel").first()).toBeVisible();
  await expect(page.locator("#qr-body .skel").first()).toBeVisible();
  await expect.poll(retenido.vistos).toBeGreaterThanOrEqual(5);

  await retenido.liberar();

  await expect(page.locator("#saldo-caja")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#card-movimientos")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#card-venc")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#card-qr")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#card-cierre")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#mov-body .skel")).toHaveCount(0);
  await expect(page.locator("#venc-lista .skel")).toHaveCount(0);
  await expect(page.locator("#qr-body .skel")).toHaveCount(0);
  await expect(page.locator("#estado-movs")).toHaveText("Sin movimientos registrados.");
});

test("NAV-S3: stock muestra skeleton hasta que llega el catálogo", async ({ page }) => {
  const catalogo = await retener(page, "**/api/products?panel=1", (route) =>
    json(route, {
      productos: [
        { sku: "A", nombre: "Uno", precioCentavos: 1000, stock_disponible: 5 },
        { sku: "B", nombre: "Dos", precioCentavos: 2000, stock_disponible: 0 },
      ],
      kpis: { bajo_minimo: 1, sin_verificar: 0, total: 2, con_minimo: 2 },
    }),
  );
  await page.route("**/api/stock/plantilla", (route) => json(route, { productos: [], sembrado: true }));
  await page.route("**/api/stock/inicial", (route) => json(route, { items: [], total: 0 }));
  await page.route("**/api/stock/precio", (route) => json(route, { items: [], total: 0 }));

  await page.goto("/panel/stock");
  await expect(page.locator("#card-catalogo")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#stock-productos .skel")).toBeVisible();
  await expect(page.locator("#catalogo-skel")).toBeVisible();
  await expect.poll(catalogo.vistos).toBe(1);

  await catalogo.liberar();

  await expect(page.locator("#card-catalogo")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#stock-productos")).toHaveText("2");
  await expect(page.locator("#stock-umbral")).toHaveText("1");
  await expect(page.locator("#catalogo-skel")).toHaveCount(0);
});

test("NAV-S3: venta muestra skeleton de balance hasta que responde la API", async ({ page }) => {
  const balance = await retener(page, "**/api/cash/balance", (route) =>
    json(route, { por_medio: { Efectivo: "1000" } }),
  );

  await page.goto("/venta");
  await expect(page.locator("#balance-card")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#balance .skel")).toBeVisible();

  await balance.liberar();

  await expect(page.locator("#balance-card")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#balance .skel")).toHaveCount(0);
  await expect(page.locator("#balance")).toContainText("Balance:");
});

test("NAV-S3: venta reemplaza el skeleton por un error visible", async ({ page }) => {
  await page.route("**/api/cash/balance", (route) => route.fulfill({ status: 500, body: "x" }));

  await page.goto("/venta");

  await expect(page.locator("#balance-card")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#balance")).toHaveText("Balance: no disponible");
  await expect(page.locator("#balance .skel")).toHaveCount(0);
});

