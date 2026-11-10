import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pillsPanel } from "../src/lib/panel-modulos.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

const COMPONENTES = readdirSync(join(RAIZ, "src/components/panel"))
  .filter((f) => f.endsWith(".astro"))
  .map((f) => `src/components/panel/${f}`);
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
  it("Inicio compone el resumen conciso y no el listado de módulos", () => {
    const panel = leer("src/pages/panel.astro");
    for (const nombre of ["PanelShell", "KpiStrip", "UpsellCard", "AsistenteDrawer", "BienvenidaDialog"]) {
      expect(panel, nombre).toContain(nombre);
    }
    for (const nombre of ["ShiftTimeline", "MovementsTable", "HeatCard", "SalesChart", "MixDonut", "StockCard", "BotCard"]) {
      expect(panel, nombre).not.toContain(nombre);
    }
    expect(panel).not.toContain("/panel/clientes");
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

  it("la barra enlaza Inicio, Productos, Vender y Fiado, con destino táctil", () => {
    const nav = leer("src/components/panel/NavTablero.astro");
    expect(nav).toContain("href={a.href}");
    expect(nav).toContain("min-height: 44px");
    expect(nav).toContain("min-width: 44px");
    expect(nav).toContain("safe-area-inset-bottom");
    expect(nav).toMatch(/prefers-reduced-motion:\s*reduce/);
    const hrefs = pillsPanel("dashboard").map((p) => p.href);
    expect(hrefs).toContain("/panel");
    expect(hrefs).toContain("/venta");
    expect(hrefs).toContain("/panel/stock");
    expect(hrefs).toContain("/panel/fiado");
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
    const nav = leer("src/components/panel/NavTablero.astro");
    expect(nav).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(nav).toContain("animation: none !important");
    expect(nav).toContain("transition: none !important");
    expect(nav).toContain("scroll-behavior: auto !important");
    const global = leer("src/styles/global.css");
    expect(global).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(global).toContain("animation: none !important");
  });
});
