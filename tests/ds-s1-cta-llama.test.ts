import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");
const TOKENS = ["src/styles/global.css", "src/styles/tokens-papel.css"];

const LITERALES = [
  "--color-llama: #ffd600",
  "--color-naranja: #f57c00",
  "--color-star-warm: #e64a19",
  "--color-star-glow: #bf360c",
  "--color-llama-hover: #ffe033",
  "--gradiente-llama: linear-gradient(135deg, var(--color-llama) 0%, var(--color-naranja) 45%, var(--color-star-warm) 100%)",
  "--sombra-cta: 0 4px 14px rgba(230,74,25,0.35)",
  "--sombra-cta-hover: 0 6px 18px rgba(230,74,25,0.35)",
];

function archivosDe(rel: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(join(RAIZ, rel), { withFileTypes: true })) {
    const hijo = `${rel}/${e.name}`;
    if (e.isDirectory()) salida.push(...archivosDe(hijo));
    else salida.push(hijo);
  }
  return salida;
}

function regla(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) return "";
  const fin = css.indexOf("}", i);
  return fin < 0 ? "" : css.slice(i, fin + 1);
}

function bloqueReduceCon(css: string, fragmento: string): string {
  const rx = /@media \(prefers-reduced-motion: reduce\) \{/g;
  for (const m of css.matchAll(rx)) {
    let i = (m.index ?? 0) + m[0].length;
    let nivel = 1;
    let cuerpo = "";
    while (nivel > 0 && i < css.length) {
      const c = css[i];
      if (c === "{") nivel += 1;
      else if (c === "}") {
        nivel -= 1;
        if (nivel === 0) break;
      }
      cuerpo += c;
      i += 1;
    }
    if (cuerpo.includes(fragmento)) return cuerpo;
  }
  return "";
}

describe("DS-S1: tokens de la paleta llama en los dos archivos de tokens", () => {
  for (const f of TOKENS) {
    it(`${f} declara cada token con su valor literal`, () => {
      const css = leer(f);
      for (const literal of LITERALES) expect(css, `${f}: ${literal}`).toContain(literal);
    });
  }

  it("#ffe033 vive solo en los archivos de tokens", () => {
    const fuera: string[] = [];
    for (const f of archivosDe("src")) {
      if (TOKENS.includes(f)) continue;
      if (/#ffe033/i.test(leer(f))) fuera.push(f);
    }
    expect(fuera).toEqual([]);
  });
});

describe("DS-S1: clase sg-flame-cta", () => {
  for (const f of TOKENS) {
    it(`${f}: fondo rust, blanco 600, sombras y estados`, () => {
      const css = leer(f);

      const base = regla(css, ".sg-flame-cta");
      expect(base, `${f}: .sg-flame-cta`).not.toBe("");
      expect(base).toContain("background-color: var(--color-star-glow)");
      expect(base).toContain("color: var(--color-star-white)");
      expect(base).toContain("font-weight: 600");
      expect(base).toContain("letter-spacing: 0.02em");
      expect(base).toContain("box-shadow: var(--sombra-cta)");
      expect(base).not.toContain("gradiente-llama");

      const hover = regla(css, ".sg-flame-cta:hover");
      expect(hover).toContain("box-shadow: var(--sombra-cta-hover)");
      expect(hover).toContain("color-mix(in srgb, var(--color-star-glow) 85%, #000)");
      expect(hover).not.toContain("star-warm");
      expect(hover).not.toContain("#e64a19");

      expect(regla(css, ".sg-flame-cta:active")).toContain("transform: scale(0.98)");
      expect(regla(css, ".sg-flame-cta:focus-visible")).toContain("outline");

      const reduce = bloqueReduceCon(css, ".sg-flame-cta");
      expect(reduce, `${f}: bloque reduce con .sg-flame-cta`).not.toBe("");
      expect(reduce).toContain("transition: none");
      expect(reduce).toContain("transform: none");
    });
  }
});

describe("DS-S1: los CTA primarios usan sg-flame-cta", () => {
  it("Button variant primary", () => {
    const button = leer("src/components/ui/Button.astro");
    const primary = button.match(/primary:\s*'([^']*)'/)?.[1] ?? "";
    expect(primary).toContain("sg-flame-cta");
    expect(primary).not.toContain("bg-star-glow");
  });

  it("SiteHeader: Probar 14 días", () => {
    const header = leer("src/components/ui/SiteHeader.astro");
    const ancla = header.match(/<a\s+href=\{ctaPrueba\.href\}[\s\S]*?>/)?.[0] ?? "";
    expect(ancla).toContain("sg-flame-cta");
    expect(ancla).not.toContain("hover:bg-void");
  });

  it("Contacto: los dos submitidos, sin tocar WhatsApp", () => {
    const contacto = leer("src/components/sections/Contacto.astro");
    const submits = [...contacto.matchAll(/<button[\s\S]*?>/g)]
      .map((m) => m[0])
      .filter((b) => b.includes("data-submit"));
    expect(submits).toHaveLength(2);
    for (const b of submits) {
      expect(b).toContain("sg-flame-cta");
      expect(b).not.toContain("hover:bg-void");
    }
    const wa = [...contacto.matchAll(/<a[\s\S]*?>/g)]
      .map((m) => m[0])
      .find((a) => a.includes('data-cta="contacto-whatsapp"'));
    expect(wa, "CTA WhatsApp").toBeTruthy();
    expect(wa ?? "").toContain("bg-whatsapp");
    expect(wa ?? "").not.toContain("sg-flame-cta");
  });
});

describe("DS-S1: el gradiente llama queda decorativo", () => {
  it("ninguna línea que usa el gradiente tiene texto claro encima", () => {
    const blancos =
      /text-star-white|text-galaxy-deep|text-space-mist|text-soft-linen|text-canvas-white|text-white|color:\s*(#fff\b|white)/i;
    const malas: string[] = [];
    for (const f of archivosDe("src")) {
      for (const [n, linea] of leer(f).split("\n").entries()) {
        if (!linea.includes("gradiente-llama")) continue;
        if (blancos.test(linea)) malas.push(`${f}:${n + 1}`);
      }
    }
    expect(malas).toEqual([]);
  });
});
