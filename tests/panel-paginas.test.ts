import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pillsPanel, moduloIndice } from "../src/lib/panel-modulos.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

const COMPONENTES_PANEL = readdirSync(join(RAIZ, "src/components/panel"))
  .filter((f) => f.endsWith(".astro"))
  .map((f) => `src/components/panel/${f}`);
const fuentePanel = (): string => [leer("src/pages/panel.astro"), ...COMPONENTES_PANEL.map(leer)].join("\n");

const PANTALLAS = [
  "src/pages/panel/caja.astro",
  "src/pages/panel/stock.astro",
  "src/pages/panel/precios.astro",
  "src/pages/panel/proveedores.astro",
  "src/pages/panel/fiado.astro",
  "src/pages/panel/consumos.astro",
  "src/pages/panel/reportes.astro",
  "src/pages/panel/alertas/umbrales.astro",
  "src/pages/panel/bot/config.astro",
  "src/pages/panel/plan.astro",
  "src/pages/panel/ventas-pendientes.astro",
] as const;

const API_PERMITIDA =
  /^\/api\/(cash\/|products|lots|locations(?:\/|$)|stock\/|prices\/|suppliers|purchase-orders|supplier-invoices\/|credit\/|service-accounts|utility-bills\/|email-drafts(?:\/|$)|analytics\/|bot-modulos|plan\/|sync\/|whatsapp\/(vinculos|vincular-code|desvincular))/;

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
  it("TopPills arma los pills desde el módulo compartido, sin anclas #", () => {
    const top = leer("src/components/panel/TopPills.astro");
    expect(top).toContain("pillsPanel");
    expect(fuentePanel()).not.toMatch(/href:\s*"#/);
  });

  it("todo href de pillsPanel existe como archivo de página", () => {
    const faltantes = pillsPanel("dashboard")
      .map((p) => p.href)
      .filter((h) => archivoDeHref(h) === null);
    expect(faltantes).toEqual([]);
  });

  it("cada ancla interna del panel tiene su id en la composición", () => {
    const panel = fuentePanel();
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
    const panel = fuentePanel();
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

  it("umbrales de alerta se enlaza desde stock y desde la tarjeta de stock", () => {
    const destino = "/panel/alertas/umbrales";
    expect(archivoDeHref(destino)).toBe("src/pages/panel/alertas/umbrales.astro");
    expect(leer("src/pages/panel/stock.astro")).toContain(`href="${destino}"`);
    expect(leer("src/components/panel/StockCard.astro")).toContain(`href="${destino}"`);
  });

  it("stock.astro no muestra la palabra centavos al usuario", () => {
    const src = leer("src/pages/panel/stock.astro");
    const markup = src.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, " ");
    expect(markup).not.toMatch(/centavos/i);
    const scripts = [...src.matchAll(/<script[\s\S]*?<\/script>/gi)].map((m) => m[0]).join("\n");
    const textos = [...scripts.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map(
      (m) => m[1] ?? m[2] ?? m[3] ?? "",
    );
    expect(textos.filter((t) => /centavos/i.test(t))).toEqual([]);
  });

  it("ajustes enlaza a /panel/plan y la pantalla muestra el medidor en texto", () => {
    const destino = "/panel/plan";
    expect(archivoDeHref(destino)).toBe("src/pages/panel/plan.astro");
    expect(leer("src/components/panel/AjustesCard.astro")).toContain(`href="${destino}"`);
    const pantalla = leer("src/pages/panel/plan.astro");
    expect(pantalla).toContain('role="meter"');
    expect(pantalla).toContain("aria-valuenow");
    expect(pantalla).toContain("tabular-nums");
    expect(pantalla).toContain("fetch(\"/api/plan/resumen\")");
  });

  it("la tarjeta de bot enlaza a /panel/bot/config y la pantalla ofrece vincular", () => {
    const destino = moduloIndice("bot").href;
    expect(destino).toBe("/panel/bot/config");
    expect(archivoDeHref(destino)).toBe("src/pages/panel/bot/config.astro");
    expect(leer("src/components/panel/BotModulosCard.astro")).toContain("href={bot.href}");
    const pantalla = leer("src/pages/panel/bot/config.astro");
    expect(pantalla).toContain("Vincular WhatsApp");
    expect(pantalla).toContain("Generar código");
  });
});

describe("panel: sin números demo ni porcentajes inventados", () => {
  it("HeatCard y KpiStrip ya no marcan widgets como demo", () => {
    expect(leer("src/components/panel/HeatCard.astro")).not.toMatch(/demo/i);
    expect(leer("src/components/panel/KpiStrip.astro")).not.toMatch(/demo/i);
  });

  it("la segbar arranca sin porcentajes hardcodeados", () => {
    const kpi = leer("src/components/panel/KpiStrip.astro");
    const inicio = kpi.indexOf('class="segbar"');
    const fin = kpi.indexOf('class="bignums"');
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    expect(kpi.slice(inicio, fin)).not.toMatch(/\d+%/);
  });
});
