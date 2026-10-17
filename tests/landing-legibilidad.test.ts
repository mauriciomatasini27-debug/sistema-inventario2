import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

const SECCIONES = "src/components/sections";

const CLARAS = [
  "text-canvas-white",
  "text-star-white",
  "text-galaxy-deep",
  "text-space-mist",
  "text-soft-linen",
  "text-canvas",
  "text-linen",
];

const OSCURAS_EN_SECCION_DARK = ["text-core-cream", "text-void"];

const BG_OSCURO = [
  "bg-void",
  "bg-space-void",
  "bg-star-glow",
  "bg-trust",
  "bg-trust-slate",
  "bg-galaxy-blue",
  "bg-midnight-void",
];

const BG_CLARO = [
  "bg-space-mist",
  "bg-canvas",
  "bg-linen",
  "bg-star-white",
  "bg-galaxy-deep",
  "bg-whatsapp",
  "bg-llama",
  "galaxy-card",
];

function tokens(clase: string): string[] {
  return clase.split(/\s+/).filter(Boolean);
}

function tiene(clase: string, token: string): boolean {
  return tokens(clase).some((t) => t === token || t.startsWith(`${token}/`));
}

function clases(src: string): string[] {
  const salida: string[] = [];
  for (const m of src.matchAll(/class="([^"]*)"/g)) salida.push(m[1] ?? "");
  for (const m of src.matchAll(/class:list=\{\[([\s\S]*?)\]\}/g)) {
    for (const s of (m[1] ?? "").matchAll(/'([^']*)'/g)) salida.push(s[1] ?? "");
  }
  return salida;
}

function seccionesCon(variant: string): string[] {
  return readdirSync(join(RAIZ, SECCIONES))
    .filter((n) => n.endsWith(".astro"))
    .map((n) => `${SECCIONES}/${n}`)
    .filter((f) => new RegExp(`variant="${variant}"`).test(leer(f)));
}

describe("landing legible sobre papel (HIGH AUDITORIA-DS)", () => {
  it("Section.astro: linen/white/embedded usan texto oscuro, no claro", () => {
    const src = leer("src/components/ui/Section.astro");
    const mapa = src.match(/const bg = \{([\s\S]*?)\}\[variant\]/)?.[1] ?? "";
    for (const variante of ["linen", "white"]) {
      const linea = mapa.split("\n").find((l) => l.trim().startsWith(`${variante}:`)) ?? "";
      for (const t of CLARAS) {
        expect(tiene(linea, t), `${variante}: ${t} en "${linea.trim()}"`).toBe(false);
      }
      expect(linea, variante).toContain("text-void");
    }
    const embedded = src.match(/embedded \? \(([\s\S]*?)\)\s*:\s*\(/)?.[1] ?? "";
    for (const t of CLARAS) {
      expect(tiene(embedded, t), `embedded: ${t}`).toBe(false);
    }
    expect(embedded).toContain("text-void");
  });

  it("Hero, SiteHeader y secciones linen/white no pintan texto claro sobre claro", () => {
    const objetivos = [
      "src/components/sections/Hero.astro",
      "src/components/ui/SiteHeader.astro",
      ...seccionesCon("linen"),
      ...seccionesCon("white"),
    ];
    for (const f of objetivos) {
      for (const c of clases(leer(f))) {
        const clara = CLARAS.find((t) => tiene(c, t));
        if (!clara) continue;
        const sobreOscuro = BG_OSCURO.some((b) => tiene(c, b));
        expect(sobreOscuro, `${f}: "${clara}" sin fondo oscuro en "${c}"`).toBe(true);
      }
    }
  });

  it("secciones dark no pintan texto oscuro salvo sobre fondo claro", () => {
    for (const f of seccionesCon("dark")) {
      for (const c of clases(leer(f))) {
        const oscura = OSCURAS_EN_SECCION_DARK.find((t) => tiene(c, t));
        if (!oscura) continue;
        const sobreClaro = BG_CLARO.some((b) => tiene(c, b));
        expect(sobreClaro, `${f}: "${oscura}" sin fondo claro en "${c}"`).toBe(true);
      }
    }
  });

  it("Button ghost-light (fondo claro) tiene texto oscuro y el hero y las secciones claras no usan ghost-dark", () => {
    const button = leer("src/components/ui/Button.astro");
    const ghostLight = button.match(/'ghost-light':\s*'([^']*)'/)?.[1] ?? "";
    expect(ghostLight).toContain("text-void");
    for (const t of CLARAS) expect(tiene(ghostLight, t), `ghost-light: ${t}`).toBe(false);
    for (const f of ["src/components/sections/Hero.astro", ...seccionesCon("linen"), ...seccionesCon("white")]) {
      expect(leer(f), f).not.toContain('variant="ghost-dark"');
    }
  });

  it("SiteHeader no usa fondo oscuro ni glass", () => {
    const src = leer("src/components/ui/SiteHeader.astro");
    expect(src).not.toContain("bg-space-void");
    expect(src).not.toContain("backdrop-blur");
  });
});
