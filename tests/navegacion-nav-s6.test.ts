import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { iniciarReveal, type ElementoRevelable, type EntradaObservada, type Observador } from "../src/lib/navegacion-reveal.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

function elemento(): ElementoRevelable & { clases: string[] } {
  const clases: string[] = [];
  return {
    clases,
    classList: {
      add: (...nuevas: string[]) => {
        clases.push(...nuevas);
      },
    },
  };
}

function observadorFalso() {
  const observados: ElementoRevelable[] = [];
  const desobservados: ElementoRevelable[] = [];
  let notificar: (entradas: EntradaObservada[]) => void = () => undefined;
  const observador: Observador = {
    observe: (el) => observados.push(el),
    unobserve: (el) => desobservados.push(el),
    disconnect: () => undefined,
  };
  const crear = (callback: (entradas: EntradaObservada[]) => void): Observador => {
    notificar = callback;
    return observador;
  };
  const entrada = (el: ElementoRevelable, isIntersecting = true): EntradaObservada => ({ target: el, isIntersecting });
  const alIntersectar = (...entradas: EntradaObservada[]) => notificar(entradas);
  return { crear, observados, desobservados, entrada, alIntersectar };
}

describe("NAV-S6: reveal sin movimiento cuando el sistema pide reduce", () => {
  it("con reduce no marca reveal ni crea IntersectionObserver", () => {
    const els = [elemento(), elemento()];
    const { crear } = observadorFalso();
    let creado = 0;


    const resultado = iniciarReveal({
      elementos: els,
      reduce: true,
      crearObservador: (callback) => {
        creado += 1;
        return crear(callback);
      },
    });

    expect(creado).toBe(0);
    expect(resultado.revelados).toBe(0);
    expect(els.map((e) => e.clases)).toEqual([[], []]);
  });

  it("sin reduce y con IntersectionObserver, marca reveal y observa cada sección", () => {
    const els = [elemento(), elemento()];
    const { crear, observados, entrada, alIntersectar } = observadorFalso();

    const resultado = iniciarReveal({ elementos: els, reduce: false, crearObservador: crear });

    expect(resultado.revelados).toBe(2);
    expect(els.every((e) => e.clases.includes("reveal"))).toBe(true);
    expect(observados).toEqual(els);

    alIntersectar(entrada(els[0]!));
    expect(els[0]!.clases).toContain("visible");
    expect(els[1]!.clases).not.toContain("visible");
  });

  it("una entrada que no intersecta no revela y la que entra se deja de observar", () => {
    const els = [elemento(), elemento()];
    const { crear, desobservados, entrada, alIntersectar } = observadorFalso();

    iniciarReveal({ elementos: els, reduce: false, crearObservador: crear });
    alIntersectar(entrada(els[0]!, false));
    expect(els[0]!.clases).not.toContain("visible");

    alIntersectar(entrada(els[1]!));
    expect(desobservados).toEqual([els[1]]);
  });

  it("sin IntersectionObserver el contenido queda visible (mejora progresiva)", () => {
    const els = [elemento(), elemento()];

    const resultado = iniciarReveal({ elementos: els, reduce: false });

    expect(resultado.revelados).toBe(0);
    expect(resultado.observador).toBeUndefined();
    expect(els.map((e) => e.clases)).toEqual([[], []]);
  });
});

describe("NAV-S6: presupuesto de motion", () => {
  it("la duración de entrada está tokenizada y no supera 300 ms", () => {
    const css = leer("src/styles/global.css");
    const token = /--motion-entrada:\s*(\d+)ms/.exec(css);
    expect(token, "--motion-entrada en global.css").not.toBeNull();
    expect(Number(token![1])).toBeLessThanOrEqual(300);
    expect(css).toMatch(/\.reveal\s*\{[^}]*transition:[^;]*var\(--motion-entrada\)/);
  });

  it("NumberFlow respeta reduce y sus animaciones quedan dentro del presupuesto", () => {
    const tsx = leer("src/components/panel/TablaCatalogo.tsx");
    expect(tsx).toContain("respectMotionPreference");

    const duraciones = [...tsx.matchAll(/(?:transformTiming|opacityTiming)=\{\{\s*duration:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(duraciones.length).toBeGreaterThan(0);
    for (const duracion of duraciones) expect(duracion).toBeLessThanOrEqual(300);
  });

  it("BaseLayout delega el reveal al módulo y decide reduce antes de animar", () => {
    const astro = leer("src/layouts/BaseLayout.astro");
    expect(astro).toContain("iniciarReveal");
    expect(astro).toContain("navegacion-reveal");
    expect(astro).toContain("(prefers-reduced-motion: reduce)");
    expect(astro).not.toContain("classList.add('reveal')");
  });
});
