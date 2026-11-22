import { describe, expect, it } from "vitest";
import {
  PASOS_CI,
  PASOS_DOCS,
  dependenciasIncumplidas,
  planDePasos,
  resumir,
} from "../scripts/verify-lib.mjs";

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

  it("los checks de docs corren antes de los writers y llevan --check", () => {
    const pasos = planDePasos({ docsOnly: true });
    expect(pasos.map((p) => p.nombre)).toEqual([
      "docs:generados",
      "docs:comentarios-check",
      "docs:estado-check",
      "docs:index-check",
      "docs:migraciones-check",
      "roadmap-check",
      "docs:migraciones",
      "roadmap",
      "docs:estado",
      "docs:index",
      "docs:check",
    ]);
    for (const n of [
      "docs:comentarios-check",
      "docs:estado-check",
      "docs:index-check",
      "docs:migraciones-check",
      "roadmap-check",
    ]) {
      expect(pasos.find((p) => p.nombre === n)?.extra).toEqual(["--check"]);
    }
  });
});

describe("verify: pasos dependientes", () => {
  it("skips se salta si falló test, aunque los demás pasos sigan", () => {
    expect(
      dependenciasIncumplidas({ nombre: "skips" }, [
        { nombre: "arch", code: 1 },
        { nombre: "test", code: 1 },
      ]),
    ).toEqual(["test"]);
  });

  it("skips corre cuando test pasó aunque arch haya fallado", () => {
    expect(
      dependenciasIncumplidas({ nombre: "skips" }, [
        { nombre: "arch", code: 1 },
        { nombre: "test", code: 0 },
      ]),
    ).toEqual([]);
  });

  it("los escritores de docs se saltan si falló un check de docs", () => {
    expect(
      dependenciasIncumplidas({ nombre: "docs:estado" }, [
        { nombre: "docs:estado-check", code: 1 },
      ]),
    ).toEqual(["docs:estado-check"]);
  });

  it("un check de docs fallido no bloquea la suite de tests", () => {
    expect(
      dependenciasIncumplidas({ nombre: "test" }, [
        { nombre: "docs:estado-check", code: 1 },
      ]),
    ).toEqual([]);
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

  it("no cuenta como fallo un paso saltado y lo reporta aparte", () => {
    const r = resumir([
      { nombre: "arch", code: 1 },
      { nombre: "test", code: 0 },
      { nombre: "skips", skipped: true },
    ]);
    expect(r.ok).toBe(false);
    expect(r.fallidos).toEqual(["arch"]);
    expect(r.saltados).toEqual(["skips"]);
  });
});
