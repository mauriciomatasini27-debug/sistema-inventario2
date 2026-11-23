import { expect, test, type Page } from "@playwright/test";

interface EstadoMotion {
  animaciones: number[];
  observadores: number;
}

async function instrumentar(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const estado: EstadoMotion = { animaciones: [], observadores: 0 };
    (window as unknown as { __navS6: EstadoMotion }).__navS6 = estado;

    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<typeof animate>) {
      const opciones = args[1] as { duration?: number | string } | undefined;
      if (typeof opciones?.duration === "number") estado.animaciones.push(opciones.duration);
      return animate.apply(this, args);
    };

    const Original = window.IntersectionObserver;
    window.IntersectionObserver = class extends Original {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options);
        estado.observadores += 1;
      }
    };
  });
}

async function esperarPaginaConReveal(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("main section[id]").first()).toBeVisible();
}

async function esperarCatalogo(page: Page): Promise<void> {
  await page.goto("/panel/precios?data=mil");
  await expect(page.locator("table[aria-rowcount]")).toHaveAttribute("aria-rowcount", "1000");
  await expect.poll(() => page.locator("number-flow-react").count()).toBeGreaterThan(0);
}

async function cambiarPrecio(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (globalThis as unknown as {
      __catalogoPanel: { items: { precioCentavos: number }[]; oyentes: Set<(items: unknown[]) => void> };
    }).__catalogoPanel;
    const items = store.items.map((producto, indice) =>
      indice === 0 ? { ...producto, precioCentavos: producto.precioCentavos + 137 } : producto,
    );
    store.items = items;
    for (const oyente of store.oyentes) oyente(items);
  });
}

async function estado(page: Page): Promise<EstadoMotion> {
  return page.evaluate(() => (window as unknown as { __navS6: EstadoMotion }).__navS6);
}

test.describe("NAV-S6 con prefers-reduced-motion: reduce", () => {
  test.use({ reducedMotion: "reduce" });

  test("no corre reveal ni precios animados", async ({ page }) => {
    await instrumentar(page);
    await esperarPaginaConReveal(page);

    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    expect((await estado(page)).observadores).toBe(0);
    expect(await page.locator("main section[id].reveal").count()).toBe(0);

    const estilo = await page.locator("main section[id]").first().evaluate((el) => {
      const calculado = getComputedStyle(el);
      return { opacity: calculado.opacity, transition: calculado.transitionDuration };
    });
    expect(estilo.opacity).toBe("1");
    expect(Number.parseFloat(estilo.transition) * 1000, "kill switch de reduce").toBeLessThanOrEqual(0.01);

    await esperarCatalogo(page);
    await page.evaluate(() => {
      (window as unknown as { __navS6: EstadoMotion }).__navS6.animaciones.length = 0;
    });
    await cambiarPrecio(page);
    await page.waitForTimeout(300);

    expect((await estado(page)).animaciones).toEqual([]);
  });
});

test.describe("NAV-S6 con movimiento permitido", () => {
  test.use({ reducedMotion: "no-preference" });

  test("reveal y NumberFlow quedan dentro del presupuesto de 240 ms", async ({ page }) => {
    await instrumentar(page);
    await esperarPaginaConReveal(page);

    expect((await estado(page)).observadores).toBeGreaterThan(0);
    const transicion = await page
      .locator("main section[id]")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(Number.parseFloat(transicion) * 1000).toBeLessThanOrEqual(241);

    await esperarCatalogo(page);
    await page.evaluate(() => {
      (window as unknown as { __navS6: EstadoMotion }).__navS6.animaciones.length = 0;
    });
    await cambiarPrecio(page);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __navS6: EstadoMotion }).__navS6.animaciones.length))
      .toBeGreaterThan(0);

    const animaciones = (await estado(page)).animaciones;
    expect(Math.max(...animaciones)).toBeLessThanOrEqual(241);
  });
});
