import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAREJAS, evaluar, tokensDeCss } from "../scripts/check-contrast-lib.mjs";
import { EMBER_MODULO, emberModulo, pillsPanel, type ModuloPanel } from "../src/lib/panel-modulos.js";

// Marca 2 (DS-S2/DS-S4): toggle de tema en /admin, arreglos del segbar y del
// banner, acentos ember en secundarias y la serie ember de los gráficos.
const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

const MODULOS: readonly ModuloPanel[] = ["caja", "stock", "precios", "proveedores", "consumos", "fiado", "reportes"];

describe("marca 2: toggle de tema en /admin", () => {
  const admin = leer("src/pages/admin.astro");

  it("importa y monta TemaInicial y TemaToggle", () => {
    expect(admin).toContain('import TemaInicial from "../components/ui/TemaInicial.astro"');
    expect(admin).toContain('import TemaToggle from "../components/ui/TemaToggle.astro"');
    expect(admin).toContain("<TemaInicial />");
    expect(admin).toContain("<TemaToggle />");
  });

  it("mora en ember coral y Al día/Cobrado con el token de estado ok", () => {
    expect(admin).toMatch(/id="seg-mora" class="ember-coral"/);
    expect(admin).toMatch(/id="dona-arco"[^>]*stroke="var\(--estado-ok\)"/);
    expect(admin).not.toContain("var(--serie-ember)");
  });

  it("el porcentaje de la dona sigue el color del texto (se lee en oscuro)", () => {
    expect(admin).toMatch(/id="dona-pct"[^>]*fill="currentColor"/);
    expect(leer("src/components/panel/MixDonut.astro")).toMatch(/id="dona-pct"[^>]*fill="currentColor"/);
  });

  it("no quedan hex sueltos de bordes y textos", () => {
    for (const hex of ["#ddd6c4", "#e3ddcd", "#55524a"]) {
      expect(admin, hex).not.toContain(hex);
    }
  });
});

describe("marca 2: arreglos del segbar y del banner en /panel", () => {
  const panel = leer("src/pages/panel.astro");

  it("los segmentos con color excluyen .vacio", () => {
    expect(panel).toContain(":not(.vacio):nth-child");
    expect(panel).not.toMatch(/\.segbar span:nth-child\(\d\)\s*\{/);
  });

  it("el vacío ocupa toda la barra con fondo de línea y texto suave", () => {
    expect(panel).toMatch(/\.segbar span\.vacio\s*\{[^}]*flex:\s*1/);
    expect(panel).toMatch(/\.segbar span\.vacio\s*\{[^}]*background:\s*var\(--tema-linea\)/);
    expect(panel).toMatch(/\.segbar span\.vacio\s*\{[^}]*color:\s*var\(--tema-texto-suave\)/);
    expect(panel).toMatch(/\.segbar span\.vacio\s*\{[^}]*box-shadow:\s*none/);
  });

  it("la etiqueta de los KPI no se corta en dos renglones (el punto ember la alarga)", () => {
    expect(panel).toMatch(/\.bignum small\s*\{[^}]*white-space:\s*nowrap/);
    expect(panel).toMatch(/\.bignums\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it("el botón del banner no envuelve la flecha", () => {
    expect(panel).toMatch(/\.banner a\s*\{[^}]*white-space:\s*nowrap/);
    expect(panel).toMatch(/\.banner a\s*\{[^}]*flex-shrink:\s*0/);
  });
});

describe("marca 2: ember por módulo", () => {
  it("cada módulo tiene su tono y dashboard/ventas no", () => {
    const esperado: Record<ModuloPanel, string> = {
      caja: "ambar",
      stock: "coral",
      precios: "rojo",
      proveedores: "vino",
      consumos: "ambar",
      fiado: "coral",
      reportes: "vino",
    };
    for (const m of MODULOS) expect(emberModulo(m), m).toBe(esperado[m]);
    expect(EMBER_MODULO).toEqual(esperado);

    const porHref = new Map(pillsPanel("dashboard").map((p) => [p.href, p]));
    for (const m of MODULOS) expect(porHref.get(`/panel/${m}`)?.ember, m).toBe(esperado[m]);
    expect(porHref.get("/panel")?.ember).toBeUndefined();
    expect(porHref.get("/venta")?.ember).toBeUndefined();
  });

  it("TopPills pinta el punto decorativo de los módulos", () => {
    const top = leer("src/components/panel/TopPills.astro");
    expect(top).toContain("pill-ember");
    expect(top).toContain("ember-${p.ember}");
    expect(top).toContain('aria-hidden="true"');
  });
});

describe("marca 2: serie ember en los gráficos", () => {
  const tema = leer("src/styles/tema.css");

  it("tema.css define --serie-ember en claro y oscuro", () => {
    const corte = tema.indexOf(':root[data-tema="oscuro"]');
    const claro = tema.slice(0, corte);
    const oscuro = tema.slice(corte);
    expect(claro).toContain("--serie-ember: var(--color-ember-vino)");
    expect(oscuro).toContain("--serie-ember: var(--color-ember-ambar)");
  });

  it("SalesChart y MixDonut usan la serie ember", () => {
    for (const f of ["src/components/panel/SalesChart.astro", "src/components/panel/MixDonut.astro"]) {
      expect(leer(f), f).toContain("var(--serie-ember)");
    }
  });
});

describe("marca 2: pares de contraste", () => {
  const tokens = tokensDeCss(leer("src/styles/global.css"));
  const filas = evaluar(PAREJAS, tokens);

  it("incluye los pares nuevos y todos pasan con los tokens de global.css", () => {
    const nuevos = [
      "muted-dark sobre void",
      "muted-dark sobre mid",
      "texto sobre mid",
      "serie ember claro: vino sobre star-white",
      "serie ember oscuro: ambar sobre charcoal",
      "admin demo: void sobre llama",
      "serie ok claro: ok sobre star-white",
      "texto sobre ember-coral (mora admin)",
    ];
    const porNombre: Record<string, { resultado: string }> = {};
    for (const fila of filas) porNombre[fila.nombre] = fila;
    for (const n of nuevos) {
      const fila = porNombre[n];
      expect(fila, n).toBeTruthy();
      expect(fila?.resultado, n).toBe("PASS");
    }
  });
});
