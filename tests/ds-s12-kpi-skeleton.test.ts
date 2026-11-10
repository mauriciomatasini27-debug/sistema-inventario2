import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kpiListo, pintarKpi, renderResumen, renderResumenError } from "../src/lib/panel-dashboard.js";

// DS-S12/DS-S17: la franja KPI de /panel arranca en skeleton con shimmer,
// los valores entran escalonados y con movimiento reducido no se anima nada.
const leer = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");
const KPI = "src/components/panel/KpiStrip.astro";

function estilo(astro: string): string {
  const m = astro.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m?.[1] ?? "";
}

/** DOM mínimo: solo lo que usan pintarKpi, kpiListo, pintarSegbar y renderResumen*. */
class ElFalso {
  hijos: ElFalso[] = [];
  padre: ElFalso | null = null;
  className = "";
  style: Record<string, string> = {};
  private texto = "";
  private attrs = new Map<string, string>();
  readonly classList = {
    add: (c: string) => {
      if (!this.className.split(" ").includes(c)) this.className = (this.className + " " + c).trim();
    },
    contains: (c: string) => this.className.split(" ").includes(c),
  };
  constructor(public tag = "div") {}
  get textContent(): string {
    return this.hijos.length ? this.hijos.map((h) => h.textContent).join("") : this.texto;
  }
  set textContent(v: string) {
    this.hijos = [];
    this.texto = v;
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  appendChild(h: ElFalso): ElFalso {
    h.padre = this;
    this.hijos.push(h);
    return h;
  }
  append(...hs: ElFalso[]): void {
    hs.forEach((h) => this.appendChild(h));
  }
  replaceChildren(...hs: ElFalso[]): void {
    this.hijos = [];
    this.texto = "";
    this.append(...hs);
  }
  closest(sel: string): ElFalso | null {
    const clase = sel.replace(/^\./, "");
    let el: ElFalso | null = this;
    while (el && !el.classList.contains(clase)) el = el.padre;
    return el;
  }
}

function franja() {
  const strip = new ElFalso();
  strip.setAttribute("aria-busy", "true");
  strip.setAttribute("data-pendientes", "resumen caja");
  const segbar = new ElFalso();
  const skelBarra = new ElFalso("i");
  skelBarra.className = "skel skel-barra";
  segbar.appendChild(skelBarra);
  const ids: Record<string, ElFalso> = { "kpi-strip": strip, segbar };
  for (const id of ["n-tickets", "n-stock", "n-caja"]) {
    const bignum = new ElFalso();
    bignum.className = "bignum";
    const b = bignum.appendChild(new ElFalso("b"));
    const skel = new ElFalso("i");
    skel.className = "skel";
    b.appendChild(skel);
    ids[id] = b;
  }
  vi.stubGlobal("document", {
    getElementById: (id: string) => ids[id] ?? null,
    createElement: (tag: string) => new ElFalso(tag),
  });
  return ids;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DS-S12 KpiStrip: marcado de carga", () => {
  const kpi = leer(KPI);

  it("la franja arranca ocupada con las dos fuentes pendientes", () => {
    expect(kpi).toMatch(/id="kpi-strip" aria-busy="true" data-pendientes="resumen caja"/);
  });

  it("cada número y la segbar arrancan en skeleton oculto al lector, sin '…' ni 'Sin datos'", () => {
    for (const id of ["n-tickets", "n-stock", "n-caja"]) {
      expect(kpi).toContain(`<b id="${id}"><i class="skel" aria-hidden="true"></i></b>`);
    }
    expect(kpi).toMatch(/id="segbar"[^>]*>\s*<i class="skel skel-barra" aria-hidden="true"><\/i>\s*<\/div>/);
    const bignums = kpi.slice(kpi.indexOf('class="bignums"'), kpi.indexOf('id="kpi-estado"'));
    expect(bignums).not.toContain("…");
    expect(kpi).not.toContain("Sin datos");
    expect(kpi).toContain('<div class="estado" id="kpi-estado">Resumen: cargando…</div>');
  });

  it("los tres KPI tienen índice de stagger 0, 1 y 2", () => {
    expect([...kpi.matchAll(/style="--i: (\d)"/g)].map((m) => m[1])).toEqual(["0", "1", "2"]);
  });
});

describe("DS-S12 KpiStrip: estilos del skeleton", () => {
  const css = estilo(leer(KPI));

  it("el shimmer usa solo tokens de rol, sin colores sueltos", () => {
    expect(css).toMatch(/linear-gradient\(90deg, var\(--tema-linea\)[^;]*var\(--tema-superficie\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(css).toMatch(/\.skel \{[^}]*animation: kpi-shimmer /);
  });

  it("la entrada de cada valor se escalona por --i", () => {
    expect(css).toMatch(/\.bignum\.listo \{[^}]*animation: kpi-entra [^}]*animation-delay: calc\(var\(--i, 0\) \* 60ms\)/);
  });

  it("con prefers-reduced-motion: reduce no hay shimmer ni stagger", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.skel, \.bignum\.listo \{ animation: none !important; \}/);
  });
});

describe("DS-S12 pintarKpi / kpiListo", () => {
  it("pintarKpi reemplaza el skeleton por el valor y marca el bignum para entrar", () => {
    const ids = franja();
    pintarKpi("n-tickets", "3");
    expect(ids["n-tickets"]?.textContent).toBe("3");
    expect(ids["n-tickets"]?.hijos).toEqual([]);
    expect(ids["n-tickets"]?.padre?.classList.contains("listo")).toBe(true);
    expect(ids["n-stock"]?.padre?.classList.contains("listo")).toBe(false);
  });

  it("aria-busy pasa a false recién cuando resolvieron las dos fuentes, en cualquier orden", () => {
    const ids = franja();
    const busy = () => ids["kpi-strip"]?.getAttribute("aria-busy");
    kpiListo("caja");
    expect(busy()).toBe("true");
    kpiListo("caja");
    expect(busy()).toBe("true");
    kpiListo("resumen");
    expect(busy()).toBe("false");
  });

  it("renderResumen pinta los KPI y la segbar y resuelve la fuente resumen", () => {
    const ids = franja();
    renderResumen({ tickets_hoy: 3, stock_bajo: 1, por_medio: [{ medio: "Efectivo", centavos: "1000" }] });
    expect(ids["n-tickets"]?.textContent).toBe("3");
    expect(ids["n-stock"]?.textContent).toBe("1");
    expect(ids.segbar?.textContent).toBe("100% Efectivo");
    expect(ids["kpi-strip"]?.getAttribute("data-pendientes")).toBe("caja");
    expect(ids["kpi-strip"]?.getAttribute("aria-busy")).toBe("true");
  });

  it("renderResumenError saca los skeleton (— y 'Sin datos') y también resuelve la fuente", () => {
    const ids = franja();
    renderResumenError();
    expect(ids["n-tickets"]?.textContent).toBe("—");
    expect(ids["n-stock"]?.textContent).toBe("—");
    expect(ids.segbar?.textContent).toBe("Sin datos");
    expect(ids.segbar?.hijos.map((h) => h.className)).toEqual(["vacio"]);
    kpiListo("caja");
    expect(ids["kpi-strip"]?.getAttribute("aria-busy")).toBe("false");
  });
});
