import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAVE_TEMA, SCRIPT_TEMA_TOGGLE } from "../src/lib/tema.js";

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

const PAGINAS_ALTA = ["src/pages/alta.astro", "src/pages/alta/estado.astro"] as const;
const SHELL = "src/components/alta/AltaShell.astro";
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGB = /\brgba?\s*\(/i;

describe("TB-ALTA: shell tablero B con tema", () => {
  it("AltaShell importa tokens y tema, TemaInicial antes del style y trae toggle", () => {
    const s = leer(SHELL);
    expect(s).toContain('import "../../styles/tokens-papel.css"');
    expect(s).toContain('import "../../styles/tema.css"');
    expect(s).toContain("<TemaInicial");
    expect(s).toContain("<TemaToggle");
    const inicial = s.indexOf("<TemaInicial");
    const style = s.indexOf("<style");
    expect(inicial).toBeGreaterThan(-1);
    expect(style).toBeGreaterThan(inicial);
    expect(s).toContain("var(--tema-fondo)");
    expect(s).toContain(':root[data-tema="oscuro"] .tablero.alta-shell');
  });

  it("las páginas de alta usan AltaShell", () => {
    for (const f of PAGINAS_ALTA) {
      expect(leer(f), f).toContain("AltaShell");
    }
  });

  it("AltaShell no tiene hex ni rgb sueltos (solo tokens)", () => {
    const sinVars = leer(SHELL).replace(/var\([^)]*\)/g, "");
    expect(sinVars).not.toMatch(HEX);
    expect(sinVars).not.toMatch(RGB);
  });
});

describe("TB-ALTA: formulario de alta conserva ON1 y errores-campo", () => {
  const alta = leer("src/pages/alta.astro");

  it("mantiene campos, data-campo y envío a la API", () => {
    for (const id of ["nombre", "rubro", "detalle", "numero", "optin", "crear", "alta-form"]) {
      expect(alta).toContain(`id="${id}"`);
    }
    expect(alta).toContain('data-campo="nombre_comercio"');
    expect(alta).toContain("/api/onboarding/alta");
    expect(alta).toContain("localStorage");
    expect(alta).toContain("alta-vincular");
    expect(alta).toContain("/alta/estado?tenant_id=");
  });

  it("estado conserva Verificar después → /panel y entrar al comercio", () => {
    const estado = leer("src/pages/alta/estado.astro");
    expect(estado).toContain("Verificar después");
    expect(estado).toMatch(/\$\("despues"\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*location\.href\s*=\s*"\/panel"/);
    expect(estado).toContain('href="/panel"');
    expect(estado).toContain("/api/onboarding/estado");
  });
});

describe("TB-ALTA: toggle cableado (mismo script que panel/venta)", () => {
  it("el shell monta TemaToggle (data-tema-toggle en el componente)", () => {
    expect(leer(SHELL)).toContain("<TemaToggle");
    expect(leer("src/components/ui/TemaToggle.astro")).toContain("data-tema-toggle");
  });

  it("alterna data-tema al simular click (script compartido)", () => {
    const boton = {
      attrs: {} as Record<string, string>,
      listeners: {} as Record<string, Array<() => void>>,
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      },
      getAttribute(k: string) {
        return this.attrs[k] ?? null;
      },
      addEventListener(t: string, cb: () => void) {
        (this.listeners[t] ??= []).push(cb);
      },
    };
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
    boton.listeners.click?.[0]?.();
    expect(doc.documentElement.dataset.tema).toBe("oscuro");
    expect(store[CLAVE_TEMA]).toBe("oscuro");
  });
});