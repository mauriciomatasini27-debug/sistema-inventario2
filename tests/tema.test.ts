import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAVE_TEMA, SCRIPT_TEMA_INICIAL, SCRIPT_TEMA_TOGGLE, resolverTema } from "../src/lib/tema.js";

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...archivos(rel));
    else if (/\.(astro|tsx?|ts)$/.test(e.name)) out.push(rel);
  }
  return out;
}

interface Falso {
  raiz: { dataset: Record<string, string> };
  listeners: Array<(ev: { matches: boolean }) => void>;
  mq: { matches: boolean; addEventListener: (t: string, cb: (ev: { matches: boolean }) => void) => void };
  doc: { documentElement: { dataset: Record<string, string> } };
  localStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
  matchMedia: () => { matches: boolean; addEventListener: (t: string, cb: (ev: { matches: boolean }) => void) => void };
  store: Record<string, string>;
}

function entornoInicial(guardado: string | null, oscuroSistema: boolean): Falso {
  const raiz = { dataset: {} as Record<string, string> };
  const listeners: Array<(ev: { matches: boolean }) => void> = [];
  const mq = {
    matches: oscuroSistema,
    addEventListener: (_t: string, cb: (ev: { matches: boolean }) => void) => listeners.push(cb),
  };
  const store: Record<string, string> = {};
  if (guardado !== null) store[CLAVE_TEMA] = guardado;
  return {
    raiz,
    listeners,
    mq,
    doc: { documentElement: raiz },
    store,
    localStorage: {
      getItem: (k) => (k in store ? store[k] ?? null : null),
      setItem: (k, v) => {
        store[k] = v;
      },
    },
    matchMedia: () => mq,
  };
}

function correrInicial(f: Falso) {
  const fn = new Function("document", "localStorage", "matchMedia", SCRIPT_TEMA_INICIAL);
  fn(f.doc, f.localStorage, f.matchMedia);
}

function fakeBoton() {
  const attrs: Record<string, string> = {};
  const listeners: Record<string, Array<() => void>> = {};
  return {
    attrs,
    listeners,
    setAttribute(k: string, v: string) {
      attrs[k] = v;
    },
    getAttribute(k: string) {
      return attrs[k] ?? null;
    },
    addEventListener(t: string, cb: () => void) {
      if (!listeners[t]) listeners[t] = [];
      listeners[t].push(cb);
    },
  };
}

describe("tema: resolverTema", () => {
  it("la elección guardada válida gana sobre el sistema", () => {
    expect(resolverTema("claro", true)).toBe("claro");
    expect(resolverTema("oscuro", false)).toBe("oscuro");
  });

  it("sin elección válida sigue al sistema", () => {
    expect(resolverTema(null, true)).toBe("oscuro");
    expect(resolverTema(null, false)).toBe("claro");
    expect(resolverTema("otro", true)).toBe("oscuro");
  });
});

describe("tema: script inicial sin flash", () => {
  it("el guardado gana y setea data-tema", () => {
    const f = entornoInicial("claro", true);
    correrInicial(f);
    expect(f.raiz.dataset.tema).toBe("claro");
  });

  it("sin guardado sigue al sistema", () => {
    const f = entornoInicial(null, true);
    correrInicial(f);
    expect(f.raiz.dataset.tema).toBe("oscuro");
  });

  it("sin guardado escucha cambios del sistema", () => {
    const f = entornoInicial(null, false);
    correrInicial(f);
    expect(f.raiz.dataset.tema).toBe("claro");
    expect(f.listeners.length).toBe(1);
    f.mq.matches = true;
    f.listeners[0]?.({ matches: true });
    expect(f.raiz.dataset.tema).toBe("oscuro");
  });

  it("si localStorage tira igual resuelve con el sistema", () => {
    const f = entornoInicial(null, true);
    f.localStorage.getItem = () => {
      throw new Error("Safari privado");
    };
    correrInicial(f);
    expect(f.raiz.dataset.tema).toBe("oscuro");
  });

  it("si el usuario eligió después de cargar, el cambio del sistema no lo pisa", () => {
    const f = entornoInicial(null, false);
    correrInicial(f);
    f.store[CLAVE_TEMA] = "claro";
    f.listeners[0]?.({ matches: true });
    expect(f.raiz.dataset.tema).toBe("claro");
  });

  it("con guardado no escucha cambios del sistema", () => {
    const f = entornoInicial("claro", true);
    correrInicial(f);
    expect(f.listeners.length).toBe(0);
  });
});

interface FalsoTexto {
  textContent: string;
}

interface FalsoBotonSpans {
  attrs: Record<string, string>;
  listeners: Record<string, Array<() => void>>;
  icono: FalsoTexto;
  etiqueta: FalsoTexto;
  setAttribute: (k: string, v: string) => void;
  addEventListener: (t: string, cb: () => void) => void;
  querySelector: (sel: string) => FalsoTexto | null;
  getAttribute: (k: string) => string | null;
}

function fakeBotonConSpans(): FalsoBotonSpans {
  const attrs: Record<string, string> = {};
  const listeners: Record<string, Array<() => void>> = {};
  const icono: FalsoTexto = { textContent: "☾" };
  const etiqueta: FalsoTexto = { textContent: "Oscuro" };
  return {
    attrs,
    listeners,
    icono,
    etiqueta,
    setAttribute(k, v) {
      attrs[k] = v;
    },
    getAttribute(k) {
      return attrs[k] ?? null;
    },
    addEventListener(t, cb) {
      (listeners[t] ??= []).push(cb);
    },
    querySelector(sel) {
      if (sel === "[data-tema-icono]") return icono;
      if (sel === "[data-tema-etiqueta]") return etiqueta;
      return null;
    },
  };
}

function correrToggle(boton: FalsoBotonSpans, tema: "claro" | "oscuro") {
  const doc = {
    documentElement: { dataset: { tema } as Record<string, string> },
    readyState: "complete",
    querySelectorAll: () => [boton],
    addEventListener: () => {},
  };
  const localStorage = { setItem: () => {} };
  const fn = new Function("document", "localStorage", SCRIPT_TEMA_TOGGLE);
  fn(doc, localStorage);
  return doc.documentElement;
}

describe("tema: script del toggle", () => {
  it("alterna, persiste y setea aria-pressed", () => {
    const boton = fakeBoton();
    const store: Record<string, string> = {};
    const doc = {
      documentElement: { dataset: { tema: "claro" } as Record<string, string> },
      readyState: "complete",
      querySelectorAll: () => [boton],
      addEventListener: () => {},
    };
    const localStorage = {
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    const fn = new Function("document", "localStorage", SCRIPT_TEMA_TOGGLE);
    fn(doc, localStorage);
    expect(boton.attrs["aria-pressed"]).toBe("false");
    boton.listeners.click?.[0]?.();
    expect(doc.documentElement.dataset.tema).toBe("oscuro");
    expect(boton.attrs["aria-pressed"]).toBe("true");
    expect(store[CLAVE_TEMA]).toBe("oscuro");
    boton.listeners.click?.[0]?.();
    expect(doc.documentElement.dataset.tema).toBe("claro");
    expect(boton.attrs["aria-pressed"]).toBe("false");
    expect(store[CLAVE_TEMA]).toBe("claro");
  });

  it("la etiqueta, el icono y el aria-label siguen al tema", () => {
    const boton = fakeBotonConSpans();
    const raiz = correrToggle(boton, "claro");

    expect(boton.etiqueta.textContent).toBe("Oscuro");
    expect(boton.icono.textContent).toBe("☾");
    expect(boton.attrs["aria-label"]).toBe("Tema oscuro");
    expect(boton.attrs["aria-pressed"]).toBe("false");

    boton.listeners.click?.[0]?.();

    expect(raiz.dataset.tema).toBe("oscuro");
    expect(boton.etiqueta.textContent).toBe("Claro");
    expect(boton.icono.textContent).toBe("☀");
    expect(boton.attrs["aria-pressed"]).toBe("true");
    expect(boton.attrs["aria-label"]).toContain("claro");

    boton.listeners.click?.[0]?.();

    expect(raiz.dataset.tema).toBe("claro");
    expect(boton.etiqueta.textContent).toBe("Oscuro");
    expect(boton.icono.textContent).toBe("☾");
  });
});

describe("tema: cableado en las páginas con tema", () => {
  it("PanelShell pone TemaInicial antes del primer style y el toggle vive en el menú de cuenta", () => {
    const s = leer("src/components/panel/PanelShell.astro");
    const inicial = s.indexOf("<TemaInicial");
    const style = s.indexOf("<style");
    expect(inicial).toBeGreaterThan(-1);
    expect(style).toBeGreaterThan(-1);
    expect(inicial).toBeLessThan(style);
    expect(leer("src/components/panel/PanelCuentaMenu.astro")).toContain("data-tema-toggle");
  });

  it("venta.astro pone TemaInicial antes del primer <style y usa TemaToggle", () => {
    const f = "src/pages/venta.astro";
    const s = leer(f);
    const inicial = s.indexOf("<TemaInicial");
    const style = s.indexOf("<style");
    expect(inicial, f).toBeGreaterThan(-1);
    expect(style, f).toBeGreaterThan(-1);
    expect(inicial, `${f}: TemaInicial antes del <style`).toBeLessThan(style);
    expect(s, f).toContain("<TemaToggle");
  });

  it("alta usa AltaShell con TemaInicial antes del style y toggle en la barra", () => {
    const shell = leer("src/components/alta/AltaShell.astro");
    const inicial = shell.indexOf("<TemaInicial");
    const style = shell.indexOf("<style");
    expect(inicial).toBeGreaterThan(-1);
    expect(style).toBeGreaterThan(inicial);
    expect(shell).toContain("<TemaToggle");
    expect(leer("src/pages/alta.astro")).toContain("AltaShell");
    expect(leer("src/pages/alta/estado.astro")).toContain("AltaShell");
  });
});

describe("tema: hoja de tema.css (DS-S4/S5)", () => {
  const tema = leer("src/styles/tema.css");

  it("usa vidrio con fallback y reduce la transparencia", () => {
    expect(tema).toContain("prefers-reduced-transparency");
    expect(tema).toContain("@supports");
    expect(tema).toContain("backdrop-filter");
  });

  it("el opaco por reduced-transparency va después del @supports para ganarle", () => {
    expect(tema.indexOf("prefers-reduced-transparency")).toBeGreaterThan(tema.indexOf("@supports"));
    for (const f of ["src/components/panel/PanelShell.astro"]) {
      const s = leer(f);
      expect(s.indexOf("prefers-reduced-transparency"), f).toBeGreaterThan(s.indexOf("@supports"));
    }
  });

  it("no usa ambiente radial (decisión de Mauri)", () => {
    expect(tema).not.toContain("radial-gradient");
  });

  it("define --estado-* claros y oscuros para los 5 estados", () => {
    const estados = ["ok", "aviso", "vivo", "pendiente", "peligro"];
    const corte = tema.indexOf(':root[data-tema="oscuro"]');
    const claro = tema.slice(0, corte);
    const oscuro = tema.slice(corte);
    for (const e of estados) {
      expect(claro).toContain(`--estado-${e}: var(--color-${e})`);
      expect(claro).toContain(`--estado-${e}-tint: var(--color-${e}-tint)`);
      expect(oscuro).toContain(`--estado-${e}: var(--color-${e}-oscuro)`);
      expect(oscuro).toContain(`--estado-${e}-tint: var(--color-${e}-tint-oscuro)`);
    }
  });
});

describe("tema: pila del sistema y landing sin glass (ADR-0010)", () => {
  it("global.css usa la pila del sistema y no Inter", () => {
    const global = leer("src/styles/global.css");
    expect(global).not.toContain("Inter");
    expect(global).toContain("system-ui, -apple-system, 'Segoe UI', Roboto");
  });

  it("BaseLayout ya no carga Google Fonts", () => {
    expect(leer("src/layouts/BaseLayout.astro")).not.toContain("fonts.googleapis");
  });

  it("sections, ui (salvo TemaToggle) e index no usan backdrop-filter", () => {
    const objetivos = [
      ...archivos("src/components/sections"),
      ...archivos("src/components/ui").filter((f) => !f.endsWith("TemaToggle.astro")),
      "src/pages/index.astro",
    ];
    const conGlass = objetivos.filter((f) => leer(f).includes("backdrop-filter"));
    expect(conGlass).toEqual([]);
  });
});

describe("tema: una sola pila tipográfica por token (DS-S6)", () => {
  const paginas = [
    "src/pages/venta.astro",
    "src/pages/admin.astro",
    "src/pages/t/[token].astro",
    "src/components/panel/PanelShell.astro",
    "src/components/alta/AltaShell.astro",
  ];
  for (const f of paginas) {
    it(`${f} toma la fuente de var(--font-sans)`, () => {
      const s = leer(f);
      expect(s, f).toContain("var(--font-sans)");
      expect(s, f).not.toMatch(/font-family:\s*system-ui/);
    });
  }

  it("tokens-papel.css define la misma --font-sans que global.css", () => {
    const pila = (css: string) => /--font-sans:\s*([^;]+);/.exec(css)?.[1];
    expect(pila(leer("src/styles/tokens-papel.css"))).toBe(pila(leer("src/styles/global.css")));
  });
});
