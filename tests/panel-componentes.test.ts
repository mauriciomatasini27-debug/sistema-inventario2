import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pillsPanel } from "../src/lib/panel-modulos.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

const COMPONENTES = readdirSync(join(RAIZ, "src/components/panel"))
  .filter((f) => f.endsWith(".astro"))
  .map((f) => `src/components/panel/${f}`);
// UpsellPantalla es overlay de módulos, no widget del dashboard compuesto.
const DASHBOARD = COMPONENTES.filter(
  (f) => !f.endsWith("PanelShell.astro") && !f.endsWith("UpsellPantalla.astro"),
);
const fuentePanel = (): string => [leer("src/pages/panel.astro"), ...COMPONENTES.map(leer)].join("\n");

const IDS_WIDGET = [
  "n-tickets", "n-stock", "n-caja", "kpi-estado",
  "turnos-lista", "turnos-estado",
  "mov-body", "movimientos-estado", "balance-estado",
  "heat-ventas", "heat-dev", "heat", "heatmap-estado",
  "ventas-periodo", "ventas-chart", "serie-efectivo", "serie-digital", "ventas-meses", "ventas-estado",
  "dona-arco", "dona-pct", "medios-legend", "medios-estado",
  "consumos-cuentas", "consumos-proximas", "consumos-vencidas", "consumos-estado",
  "stock-estado", "umb-sku", "umb-min", "umb-re", "umb-cargar", "umb-guardar", "umb-estado",
  "fiado-estado", "bot-lista", "bot-estado",
] as const;

const IDS_SECCION = [
  "caja", "movimientos", "reportes", "ventas", "medios", "consumos",
  "pagar-servicio", "stock", "precios", "proveedores", "fiado", "bot-modulos", "ajustes",
] as const;

const TEXTO_CARGA = [
  "Resumen: cargando…", "Turnos: cargando…", "Movimientos: cargando…", "Balance: cargando…",
  "Heatmap: cargando…", "Ventas por mes: cargando…", "Composición por medio: cargando…",
  "Consumos: cargando…", "Stock: cargando…", "Módulos: cargando…",
] as const;

describe("panel compuesto: componentes conservan ids, enlaces y textos", () => {
  it("panel.astro compone todos los componentes del dashboard", () => {
    const panel = leer("src/pages/panel.astro");
    for (const f of DASHBOARD) {
      const nombre = f.replace("src/components/panel/", "").replace(".astro", "");
      expect(panel, f).toContain(nombre);
    }
  });

  it("conserva todos los ids de widgets y secciones", () => {
    const src = fuentePanel();
    for (const id of [...IDS_WIDGET, ...IDS_SECCION]) {
      expect(src, id).toContain(`id="${id}"`);
    }
  });

  it("los enlaces ↗ de los módulos usan hrefModulo", () => {
    const src = fuentePanel();
    for (const m of ["caja", "stock", "precios", "proveedores", "consumos", "fiado", "reportes"] as const) {
      expect(src, m).toContain(`href={hrefModulo("${m}")}`);
    }
    expect(src).toContain("↗");
  });

  it("TopPills enlaza a /panel/<modulo> desde pillsPanel", () => {
    const top = leer("src/components/panel/TopPills.astro");
    expect(top).toContain("pillsPanel(activo)");
    expect(top).toContain("href={p.href}");
    const hrefs = pillsPanel("dashboard").map((p) => p.href);
    expect(hrefs).toEqual([
      "/panel", "/venta", "/panel/devoluciones", "/panel/caja", "/panel/stock", "/panel/precios",
      "/panel/proveedores", "/panel/consumos", "/panel/fiado", "/panel/reportes",
      "/panel/bot/config", "/panel/alertas/umbrales",
    ]);
  });

  it("conserva los textos de carga de cada widget", () => {
    const src = fuentePanel();
    for (const t of TEXTO_CARGA) expect(src, t).toContain(t);
  });

  it("el resumen se pide una sola vez", () => {
    const veces = [...fuentePanel().matchAll(/fetch\("\/api\/sales\/resumen"\)/g)].length;
    expect(veces).toBe(1);
  });

  it("el panel aplica la regla global de prefers-reduced-motion", () => {
    const panel = leer("src/pages/panel.astro");
    expect(panel).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(panel).toContain("animation: none !important");
    expect(panel).toContain("transition: none !important");
    expect(panel).toContain("scroll-behavior: auto !important");
    const global = leer("src/styles/global.css");
    expect(global).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(global).toContain("animation: none !important");
  });
});
