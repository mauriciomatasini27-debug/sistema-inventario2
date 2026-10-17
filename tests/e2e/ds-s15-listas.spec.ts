import { expect, test, type Locator, type Page } from "@playwright/test";

// DS-S15: tabla de catálogo de alto volumen a 360px en claro y oscuro: header
// 600 con borde de 2px, celdas de 14px, hover y fila seleccionada (la del SKU
// elegido en el formulario) con fondo propio, SKU con contraste AA y sin
// transiciones de fila con movimiento reducido.

/** Contraste del texto contra el fondo efectivo (compone los fondos con alfa). */
async function contraste(celda: Locator): Promise<number> {
  return celda.evaluate((el) => {
    const parse = (c: string) => {
      const n = (c.match(/[\d.]+/g) ?? []).map(Number);
      if (c.startsWith("color(")) return { r: n[0]! * 255, g: n[1]! * 255, b: n[2]! * 255, a: n[3] ?? 1 };
      return { r: n[0] ?? 0, g: n[1] ?? 0, b: n[2] ?? 0, a: n[3] ?? 1 };
    };
    const capas: ReturnType<typeof parse>[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg.a > 0) capas.unshift(bg);
    }
    const base = document.documentElement.dataset.tema === "oscuro" ? { r: 26, g: 26, b: 26 } : { r: 255, g: 255, b: 255 };
    const fondo = capas.reduce((acc, c) => ({
      r: c.r * c.a + acc.r * (1 - c.a),
      g: c.g * c.a + acc.g * (1 - c.a),
      b: c.b * c.a + acc.b * (1 - c.a),
    }), base);
    const texto = parse(getComputedStyle(el).color);
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const [a, b] = [lum(texto), lum(fondo)].sort((x, y) => y - x);
    return (a! + 0.05) / (b! + 0.05);
  });
}

const fondoFila = (fila: Locator) => fila.evaluate((el) => getComputedStyle(el).backgroundColor);

async function abrir(page: Page, url: string, tema: "claro" | "oscuro") {
  await page.addInitScript((t) => localStorage.setItem("tema", t), tema);
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-tema", tema);
  await expect(page.locator("table[aria-rowcount]")).toHaveAttribute("aria-rowcount", "1000");
}

for (const tema of ["claro", "oscuro"] as const) {
  test.describe(`DS-S15 lista de catálogo (${tema})`, () => {
    test("header, celdas, hover, seleccionada y contraste en /panel/precios", async ({ page }, testInfo) => {
      await abrir(page, "/panel/precios?data=mil", tema);
      const th = page.locator("table.tabla-catalogo thead th").first();
      expect(await th.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("600");
      expect(await th.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe("2px");
      const sku = page.locator("table.tabla-catalogo td.sku").first();
      expect(await sku.evaluate((el) => getComputedStyle(el).fontSize)).toBe("14px");
      expect(await sku.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("500");

      // Al poblar el select queda elegido el primer SKU: esa es la fila seleccionada.
      const seleccionadas = page.locator('table.tabla-catalogo tr[data-seleccionada="true"]');
      await expect(seleccionadas).toHaveCount(1);
      await expect(seleccionadas.locator("td.sku")).toHaveText("MIL-0001");
      await expect(seleccionadas).toHaveAttribute("aria-current", "true");

      await page.locator("#preview-sku").selectOption("MIL-0003");
      await expect(seleccionadas).toHaveCount(1);
      await expect(seleccionadas.locator("td.sku")).toHaveText("MIL-0003");

      const fila = page.locator("table.tabla-catalogo tbody tr").nth(1);
      const normal = await fondoFila(fila);
      expect(await fondoFila(seleccionadas)).not.toBe(normal);
      await fila.hover();
      await expect.poll(() => fondoFila(fila)).not.toBe(normal);

      expect(await contraste(fila.locator("td.sku"))).toBeGreaterThanOrEqual(4.5);
      expect(await contraste(seleccionadas.locator("td.sku"))).toBeGreaterThanOrEqual(4.5);
      expect(await contraste(fila.locator("td.nombre"))).toBeGreaterThanOrEqual(4.5);

      const raiz = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(raiz[0]).toBeLessThanOrEqual(raiz[1]! + 1);
      await page.screenshot({ path: testInfo.outputPath(`ds15-precios-${tema}.png`) });
    });

    test("/panel/stock marca la fila del SKU tipeado y las cantidades tienen énfasis AA", async ({ page }) => {
      await abrir(page, "/panel/stock?data=mil", tema);
      await page.locator("#ingreso-sku").fill(" mil-0002 ");
      const seleccionadas = page.locator('table.tabla-catalogo tr[data-seleccionada="true"]');
      await expect(seleccionadas).toHaveCount(1);
      await expect(seleccionadas.locator("td.sku")).toHaveText("MIL-0002");
      await page.locator("#ingreso-sku").fill("");
      await expect(seleccionadas).toHaveCount(0);
      const cantidad = page.locator("table.tabla-catalogo td.cantidad").first();
      // Virtuoso puede re-renderizar la fila entre el locator y el evaluate: se reintenta.
      await expect.poll(() => cantidad.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("500");
      await expect.poll(() => contraste(cantidad)).toBeGreaterThanOrEqual(4.5);
    });
  });
}

test.describe("DS-S15 con movimiento reducido", () => {
  test.use({ reducedMotion: "reduce" });

  test("las filas no animan", async ({ page }) => {
    await abrir(page, "/panel/precios?data=mil", "claro");
    const duracion = await page
      .locator("table.tabla-catalogo tbody tr")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    // El kill global de movimiento reducido deja 0.01ms: cualquier valor por debajo de 1ms es "sin animación".
    const ms = duracion.split(",").map((d) => (d.trim().endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000));
    expect(ms.every((v) => v < 1)).toBe(true);
  });
});
