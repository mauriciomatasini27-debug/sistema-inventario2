import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chequearIssues } from "../scripts/verificar-issues-locales.mjs";

function fixture(issue: string, avance: string | null) {
  const raiz = mkdtempSync(join(tmpdir(), "issues-locales-"));
  const issues = join(raiz, ".scratch", "tema", "issues");
  mkdirSync(issues, { recursive: true });
  writeFileSync(join(issues, "01-ejemplo.md"), issue);
  if (avance !== null) {
    mkdirSync(join(raiz, "docs"), { recursive: true });
    writeFileSync(join(raiz, "docs", "avance.md"), avance);
  }
  return { raiz, issues };
}

const HECHO = "---\nitem: X\nestado: hecho\n---\nX: hecho.\n";

describe("issues locales vs avances", () => {
  it("acepta issue cerrado con avance hecho y todas las casillas tachadas", () => {
    const { raiz, issues } = fixture(
      "**Status:** cerrado\n**Avance:** docs/avance.md\n\n- [x] uno\n- [x] dos\n",
      HECHO,
    );
    expect(chequearIssues(issues, raiz)).toEqual([]);
  });

  it("falla si el avance dice hecho pero el issue sigue abierto", () => {
    const { raiz, issues } = fixture(
      "**Status:** ready-for-agent\n**Avance:** docs/avance.md\n\n- [x] uno\n",
      HECHO,
    );
    expect(chequearIssues(issues, raiz)[0]).toContain("sigue 'ready-for-agent'");
  });

  it("falla si el issue cerrado deja criterios sin tachar", () => {
    const { raiz, issues } = fixture(
      "**Status:** cerrado\n**Avance:** docs/avance.md\n\n- [ ] uno\n",
      HECHO,
    );
    expect(chequearIssues(issues, raiz)[0]).toContain("1 criterios sin tachar");
  });

  it("falla si el issue cerrado no declara avance", () => {
    const { raiz, issues } = fixture("**Status:** cerrado\n\n- [x] uno\n", null);
    expect(chequearIssues(issues, raiz)[0]).toContain("no declara **Avance:**");
  });

  it("no reporta nada si no hay tracker local", () => {
    const raiz = mkdtempSync(join(tmpdir(), "sin-issues-"));
    expect(chequearIssues(join(raiz, ".scratch"), raiz)).toEqual([]);
  });
});
