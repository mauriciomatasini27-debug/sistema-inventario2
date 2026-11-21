import { describe, expect, it } from "vitest";
import { contratoTypescriptScannerOk } from "../scripts/comentarios-typescript-scanner.mjs";
import { comentariosDeTypescript } from "../scripts/comentarios-scan-lib.mjs";

const FIXTURE = `/** JSDoc fixture */
/* bloque */
export const x = 1; // fin de línea
const s = "protocol // host";
`;

describe("contrato typescript/unstable/ast/scanner", () => {
  it("expone la API mínima; si falla, el mensaje nombra el adaptador", () => {
    const r = contratoTypescriptScannerOk();
    expect(r.ok, r.mensaje).toBe(true);
  });

  it("detecta //, /* */, JSDoc y comentario al final de línea; ignora // en string", () => {
    const c = comentariosDeTypescript(FIXTURE, "fixture.ts", 0);
    const kinds = new Set(c.map((x) => x.kind));
    expect(kinds.has("jsdoc")).toBe(true);
    expect(kinds.has("block")).toBe(true);
    expect(kinds.has("line")).toBe(true);
    const textos = c.map((x) => x.texto);
    expect(textos.some((t) => /fin de línea/.test(t))).toBe(true);
    expect(textos.some((t) => t.includes("protocol // host"))).toBe(false);
    expect(c.length).toBe(3);
  });
});