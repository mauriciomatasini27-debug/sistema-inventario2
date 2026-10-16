import { describe, expect, it } from "vitest";
import { PASOS_CI, PASOS_DOCS, planDePasos, resumir } from "../scripts/verify-lib.mjs";

describe("verify: plan de pasos", () => {
  it("completo corre los pasos de CI y después los de docs", () => {
    expect(planDePasos().map((p) => p.nombre)).toEqual([...PASOS_CI, ...PASOS_DOCS]);
  });

  it("docs-only corre solo los pasos de docs", () => {
    expect(planDePasos({ docsOnly: true }).map((p) => p.nombre)).toEqual(PASOS_DOCS);
  });

  it("replica los pasos de ci.yml", () => {
    const nombres = planDePasos().map((p) => p.nombre);
    for (const n of ["typecheck", "arch", "test", "skips", "build"]) expect(nombres).toContain(n);
  });
});

describe("verify: resumen", () => {
  it("ok cuando ningún paso falló", () => {
    expect(resumir([{ nombre: "a", code: 0 }, { nombre: "b", code: 0 }]).ok).toBe(true);
  });

  it("marca los pasos con código distinto de 0", () => {
    const r = resumir([{ nombre: "a", code: 0 }, { nombre: "b", code: 1 }]);
    expect(r.ok).toBe(false);
    expect(r.fallidos).toEqual(["b"]);
  });
});
