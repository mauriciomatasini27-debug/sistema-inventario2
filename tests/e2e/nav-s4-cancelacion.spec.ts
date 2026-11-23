import { expect, test } from "@playwright/test";

const PRODUCTO = (sku: string) => ({ sku, nombre: `Producto ${sku}`, precioCentavos: 1234, stock_disponible: 3 });

test("NAV-S4: salir de stock aborta el catálogo en vuelo y no pinta sobre precios", async ({ page }) => {
  const avisos: string[] = [];
  const fallos: string[] = [];
  const aborts = () => avisos.filter((a) => a.startsWith("abort:"));

  // El navegador no llama a AbortController.abort al navegar: si aparece el
  // beacon, lo disparó el listener de pagehide de catalogo-carga. Se manda por
  // beacon porque la consola del documento viejo se pierde al navegar.
  await page.addInitScript(() => {
    window.addEventListener("beforeunload", () => navigator.sendBeacon("/__nav-s4-pagehide", "beforeunload"));
    window.addEventListener("pagehide", () => navigator.sendBeacon("/__nav-s4-pagehide", "pagehide"));
    const original = AbortController.prototype.abort;
    AbortController.prototype.abort = function (this: AbortController) {
      navigator.sendBeacon("/__nav-s4-abort", new Error().stack ?? "");
      return original.call(this);
    };
  });
  await page.route("**/__nav-s4-pagehide", (route) => {
    avisos.push("salida:" + (route.request().postData() ?? ""));
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/__nav-s4-abort", (route) => {
    avisos.push("abort:" + (route.request().postData() ?? ""));
    return route.fulfill({ status: 204, body: "" });
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/products?panel=1")) fallos.push(request.failure()?.errorText ?? "");
  });

  let pedidosStock = 0;
  await page.route("**/api/products?panel=1", async () => {
    pedidosStock += 1;
    // La respuesta no llega nunca: el test navega a mitad de vuelo y el request
    // queda cancelado. No se responde para no competir con el unload.
    await new Promise<void>(() => {});
  });
  await page.route(/\/api\/products$/, (route) =>
    route.fulfill({ json: { productos: [PRODUCTO("PRE-1")] } }),
  );

  await page.goto("/panel/stock");
  await expect(page.locator("#catalogo-skel")).toBeVisible();
  await expect.poll(() => pedidosStock).toBe(1);
  expect(aborts()).toHaveLength(0);

  await page.goto("/panel/precios");

  await expect(page.locator(".tabla-catalogo tbody")).toContainText("PRE-1");
  await expect(page.locator(".tabla-catalogo tbody")).not.toContainText("STOCK-1");
  await expect.poll(() => fallos.length).toBeGreaterThan(0);
  expect(fallos.join(" ")).toMatch(/ABORT|cancel/i);
  await expect.poll(() => avisos.some((a) => a.startsWith("salida:"))).toBe(true);
  await expect.poll(() => aborts().length).toBeGreaterThan(0);
  expect(aborts().join(" ")).toContain("catalogo-carga");
});
