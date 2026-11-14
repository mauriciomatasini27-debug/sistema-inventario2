import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

const PAGINAS = [
  "src/pages/venta.astro",
  "src/pages/alta.astro",
  "src/pages/alta/estado.astro",
  "src/pages/t/[token].astro",
];

const HEX_SUELTOS = /#(f5f1e8|1a1a1a|111|fff|555|a00|999)\b/i;

function sinBloqueDark(astro: string): string {
  const i = astro.indexOf("@media (prefers-color-scheme: dark)");
  return i === -1 ? astro : astro.slice(0, i) + astro.slice(astro.indexOf("</style>", i));
}

function walk(rel: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, rel), { withFileTypes: true })) {
    const hijo = `${rel}/${entrada.name}`;
    if (entrada.isDirectory()) salida.push(...walk(hijo));
    else salida.push(hijo);
  }
  return salida;
}

function usaTokensPapel(pageSrc: string, f: string): boolean {
  if (/import\s+["']\.\.?\/(?:\.\.\/)?styles\/tokens-papel\.css["']/.test(pageSrc)) return true;
  if (pageSrc.includes("AltaShell")) {
    return leer("src/components/alta/AltaShell.astro").includes("tokens-papel.css");
  }
  return false;
}

describe("Tema Papel: adopción en páginas standalone (DS-S3/S7)", () => {
  for (const f of PAGINAS) {
    it(`${f} importa tokens-papel.css y no deja colores sueltos fuera del dark`, () => {
      const src = leer(f);
      expect(usaTokensPapel(src, f), f).toBe(true);
      const claro = sinBloqueDark(src);
      expect(claro, f).not.toMatch(HEX_SUELTOS);
    });
  }
});

describe("Tema Papel: admin sin paleta vieja", () => {
  it("admin.astro importa tokens-papel.css", () => {
    expect(leer("src/pages/admin.astro")).toContain('import "../styles/tokens-papel.css"');
  });

  it("admin.astro no conserva #8a8578 ni blancos sueltos", () => {
    const src = leer("src/pages/admin.astro");
    expect(src).not.toContain("#8a8578");
    expect(src).not.toMatch(/#(?:ffffff|fff)\b/i);
  });
});

describe("Tema Papel: Toaster y remitente", () => {
  it("Toaster.tsx usa tokens --color-* y no --papel/--tinta", () => {
    const src = leer("src/components/ui/Toaster.tsx");
    expect(src).not.toMatch(/var\(--papel\b/);
    expect(src).not.toMatch(/var\(--tinta\b/);
  });

  it("ningún archivo de src/ referencia modoops.local (DS-S19)", () => {
    const conModoops = walk("src").filter((f) => leer(f).includes("modoops.local"));
    expect(conModoops).toEqual([]);
  });
});

describe("Tema Papel: PWA en papel (DS-S3/DS-S20)", () => {
  it("manifest usa el papel #f7f5f2 de theme-color", () => {
    const m = JSON.parse(leer("public/manifest.webmanifest"));
    expect(m.theme_color).toBe("#f7f5f2");
    expect(m.background_color).toBe("#f7f5f2");
  });
});

describe("Tema Papel: safe-area en venta (DS-S17)", () => {
  it("/venta usa viewport-fit=cover y respeta safe-area-inset-bottom", () => {
    const src = leer("src/pages/venta.astro");
    expect(src).toContain("viewport-fit=cover");
    expect(src).toContain("safe-area-inset-bottom");
  });
});
