import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAREJAS, UMBRALES, evaluar, tokensDeCss } from "../scripts/check-contrast-lib.mjs";

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
