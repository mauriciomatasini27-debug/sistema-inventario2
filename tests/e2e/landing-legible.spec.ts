import { expect, test } from "@playwright/test";

// HIGH AUDITORIA-DS: sobre papel casi todo texto quedaba claro sobre claro.
// Recorre cada nodo de texto visible, compone el fondo real (alfa incluido) y
// exige AA. reducedMotion reduce deja las secciones `.reveal` visibles.

type Falla = { tag: string; clase: string; texto: string; ratio: number; umbral: number };

const VIEWPORTS = [
  { ancho: 360, alto: 800 },
  { ancho: 1280, alto: 800 },
];

for (const { ancho, alto } of VIEWPORTS) {
  test.describe(`landing legible a ${ancho}x${alto}`, () => {
    test.use({ viewport: { width: ancho, height: alto }, reducedMotion: "reduce" });

    test("todo texto visible cumple AA y no hay desborde", async ({ page }, testInfo) => {
      await page.goto("/");
      await page.waitForLoadState("load");

      const fallas = await page.evaluate((): Falla[] => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) return [];

        const leerColor = (valor: string) => {
          ctx.fillStyle = "#000000";
          ctx.fillStyle = valor;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: (d[3] ?? 0) / 255 };
        };

        const over = (
          fg: { r: number; g: number; b: number; a: number },
          bg: { r: number; g: number; b: number; a: number },
        ) => {
          const a = fg.a + bg.a * (1 - fg.a);
          if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
          return {
            r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
            g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
            b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
            a,
          };
        };

        const canal = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        const luminancia = (c: { r: number; g: number; b: number }) =>
          0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
        const ratio = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
          const x = luminancia(a);
          const y = luminancia(b);
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };

        const fondoEfectivo = (el: Element) => {
          const cadena: Element[] = [];
          let p: Element | null = el;
          while (p) {
            cadena.push(p);
            p = p.parentElement;
          }
          cadena.reverse();
          let acc = { r: 255, g: 255, b: 255, a: 1 };
          for (const n of cadena) {
            acc = over(leerColor(getComputedStyle(n).backgroundColor), acc);
          }
          return acc;
        };

        const tieneTextoPropio = (el: Element) => {
          for (const n of Array.from(el.childNodes)) {
            if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim()) return true;
          }
          return false;
        };

        const salida: Falla[] = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          if (!tieneTextoPropio(el)) continue;
          if (el.closest(".sr-only") || el.closest(".skip-link")) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          let opacidad = 1;
          let p: Element | null = el;
          while (p) {
            opacidad *= parseFloat(getComputedStyle(p).opacity);
            p = p.parentElement;
          }
          if (opacidad === 0) continue;

          const cs = getComputedStyle(el);
          const bg = fondoEfectivo(el);
          let fg = leerColor(cs.color);
          if (fg.a < 1) fg = over(fg, bg);
          const fs = parseFloat(cs.fontSize);
          const peso = parseInt(cs.fontWeight, 10) || 400;
          const grande = fs >= 24 || (fs >= 18.66 && peso >= 700);
          const umbral = grande ? 3 : 4.5;
          const valor = ratio(fg, bg);
          if (valor + 1e-6 < umbral) {
            let texto = "";
            for (const n of Array.from(el.childNodes)) {
              if (n.nodeType === Node.TEXT_NODE) texto += n.textContent ?? "";
            }
            salida.push({
              tag: el.tagName.toLowerCase(),
              clase: el.className?.toString?.().slice(0, 80) ?? "",
              texto: texto.trim().replace(/\s+/g, " ").slice(0, 60),
              ratio: Math.round(valor * 100) / 100,
              umbral,
            });
          }
        }
        return salida;
      });

      await page.screenshot({ path: testInfo.outputPath(`landing-${ancho}.png`), fullPage: true });

      const detalle = fallas
        .map((f) => `${f.tag}.${f.clase} "${f.texto}" = ${f.ratio}:1 (necesita ${f.umbral})`)
        .join("\n");
      expect(detalle).toBe("");

      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(desborde).toBeLessThanOrEqual(1);
    });
  });
}
