import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAREJAS, UMBRALES, evaluar, mezclar, tokensDeCss } from "../scripts/check-contrast-lib.mjs";

const RAIZ = process.cwd();
const css = readFileSync(join(RAIZ, "src/styles/global.css"), "utf8");
const tokens = tokensDeCss(css);
const filas = evaluar(PAREJAS, tokens);

describe("contraste AA por par (SPEC-UI-00 T-UI-05)", () => {
  it("cada par declara su uso y su umbral AA", () => {
    for (const p of PAREJAS) {
      expect(Object.keys(UMBRALES), p.nombre).toContain(p.uso);
    }
  });

  it("cada par mide un valor y pasa su propio umbral", () => {
    expect(filas.length).toBe(PAREJAS.length);
    for (const f of filas) {
      expect(f.fgHex, f.nombre).toBeTruthy();
      expect(f.bgHex, f.nombre).toBeTruthy();
      expect(f.umbral, f.nombre).toBe(f.uso === "texto" ? 4.5 : 3.0);
      expect(f.valor, f.nombre).not.toBeNull();
      expect(f.valor ?? 0, f.nombre).toBeGreaterThanOrEqual(f.umbral);
      expect(f.resultado, f.nombre).toBe("PASS");
    }
  });

  it("docs/diseno/contraste-aa.md coincide con la salida de --md", () => {
    const salida = execFileSync("node", ["scripts/check-contrast.mjs", "--md"], { encoding: "utf8" });
    const archivo = readFileSync(join(RAIZ, "docs/diseno/contraste-aa.md"), "utf8");
    expect(archivo).toBe(salida);
  });
});

describe("mezclar() para el peor caso de vidrio (DS-S5)", () => {
  it("mezcla lineal por canal con redondeo a entero", () => {
    expect(mezclar("#ffffff", 0.8, "#f7f5f2")).toBe("#fdfdfc");
    expect(mezclar("#2b2b2b", 0.8, "#1a1a1a")).toBe("#282828");
  });

  it("los extremos devuelven el color puro", () => {
    expect(mezclar("#ffffff", 1, "#000000")).toBe("#ffffff");
    expect(mezclar("#ffffff", 0, "#000000")).toBe("#000000");
  });

  it("un par con alfa usa el hex mezclado como BG", () => {
    const filas = evaluar(
      [{ nombre: "vidrio", fg: "void", bg: "canvas", alfa: 0.85, debajo: "void", uso: "texto", modo: "light" }],
      tokens,
    );
    expect(filas[0]?.bgHex).toBe(mezclar("#f7f5f2", 0.85, "#1a1a1a"));
  });
});

describe("CTA de la landing en naranja oscuro (decisión Mauri 2026-10-17, ADR-0008)", () => {
  it("ningún botón con texto blanco usa star-warm de fondo", async () => {
    const { readdirSync, readFileSync: leer } = await import("node:fs");
    const { join: unir } = await import("node:path");
    const archivos: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = unir(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(astro|tsx?)$/.test(e.name)) archivos.push(p);
      }
    };
    walk(unir(process.cwd(), "src"));
    for (const f of archivos) {
      const s = leer(f, "utf8");
      expect(/bg-star-warm[^"]*text-star-white|text-star-white[^"]*bg-star-warm/.test(s), f).toBe(false);
    }
  });
});
