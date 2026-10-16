import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ARCHIVOS = ["AGENTS.md", ".opencode/pstack-opencode.md"];

describe("Lectura de docs en reglas de agentes", () => {
  for (const archivo of ARCHIVOS) {
    it(`${archivo} menciona docs:context y docs/archivo`, () => {
      const texto = readFileSync(archivo, "utf8");
      expect(texto, `${archivo} debe pedir docs:context primero`).toContain("docs:context");
      expect(texto, `${archivo} debe prohibir docs/archivo`).toContain("docs/archivo");
    });
  }
});
