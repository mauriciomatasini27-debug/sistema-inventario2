import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pillsPanel } from "../src/lib/panel-modulos.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

const PANTALLAS = [
  "src/pages/panel/caja.astro",
  "src/pages/panel/stock.astro",
  "src/pages/panel/precios.astro",
  "src/pages/panel/proveedores.astro",
  "src/pages/panel/fiado.astro",
  "src/pages/panel/consumos.astro",
  "src/pages/panel/reportes.astro",
] as const;

const API_PERMITIDA =
  /^\/api\/(cash\/|products|lots|stock\/|prices\/|suppliers|purchase-orders|supplier-invoices\/|credit\/|service-accounts|utility-bills\/|analytics\/)/;

function archivoDeHref(href: string): string | null {
  const ruta = href.split("?")[0] ?? "";
  if (!ruta.startsWith("/")) return null;
  const rel = ruta === "/" ? "index" : ruta.slice(1);
  const candidatos = [join("src", "pages", `${rel}.astro`), join("src", "pages", rel, "index.astro")];
  return candidatos.find((c) => existsSync(join(RAIZ, c))) ?? null;
}

function urlsFetch(src: string): string[] {
  return [...src.matchAll(/fetch\(\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u): u is string => u !== undefined);
}

describe("panel: cada pill resuelve a una página real", () => {
  it("panel.astro arma los pills desde el módulo compartido, sin anclas #", () => {
    const panel = leer("src/pages/panel.astro");
    expect(panel).toContain("pillsPanel");
    expect(panel).not.toMatch(/href:\s*"#/);
  });

  it("todo href de pillsPanel existe como archivo de página", () => {
    const faltantes = pillsPanel("dashboard")
      .map((p) => p.href)
      .filter((h) => archivoDeHref(h) === null);
    expect(faltantes).toEqual([]);
  });

  it("cada ancla interna de panel.astro tiene su id en la página", () => {
    const panel = leer("src/pages/panel.astro");
    const anclas = [...panel.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    const ids = new Set([...panel.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const muertas = anclas.filter((a): a is string => a !== undefined && !ids.has(a));
    expect(muertas).toEqual([]);
  });

  it("existen las pantallas nuevas y el placeholder", () => {
    for (const f of [...PANTALLAS, "src/pages/panel/pronto.astro"]) {
      expect(existsSync(join(RAIZ, f)), f).toBe(true);
    }
  });

  it("los enlaces ↗ de los módulos apuntan a /panel/<modulo>, no a anclas", () => {
    const panel = leer("src/pages/panel.astro");
    const modulos = ["caja", "stock", "precios", "proveedores", "consumos", "fiado", "reportes"] as const;
    for (const m of modulos) {
      expect(panel, m).toContain(`href={hrefModulo("${m}")}`);
      expect(panel, m).not.toContain(`href="#${m}"`);
    }
  });
});

describe("pantallas de módulo: solo APIs existentes, tokens y táctil", () => {
  it("cada pantalla llama solo APIs permitidas", () => {
    for (const f of PANTALLAS) {
      const urls = urlsFetch(leer(f));
      expect(urls.length, f).toBeGreaterThan(0);
      expect(
        urls.filter((u) => !API_PERMITIDA.test(u)),
        f,
      ).toEqual([]);
    }
  });

  it("el shell usa tokens de Tema Papel y ninguna pantalla tiene colores hardcodeados", () => {
    expect(leer("src/components/panel/PanelShell.astro")).toContain("var(--color-");
    for (const f of PANTALLAS) {
      const sinTokens = leer(f).replace(/var\(--color-[^)]*\)/g, "");
      expect(sinTokens, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("el shell ofrece táctil >=44px y layout responsive", () => {
    const shell = leer("src/components/panel/PanelShell.astro");
    expect(shell).toContain("min-height: 44px");
    expect(shell).toContain("@media");
  });

  it("el placeholder respeta ?m y no llama APIs", () => {
    const src = leer("src/pages/panel/pronto.astro");
    expect(src).toContain('searchParams.get("m")');
    expect(urlsFetch(src)).toEqual([]);
  });
});
