import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PASOS_CI,
  PASOS_DOCS,
  dependenciasIncumplidas,
  maxWorkersVerify,
  planDePasos,
  resumir,
  textoResumen,
} from "../scripts/verify-lib.mjs";

describe("verify: workers de Vitest", () => {
  it("topa los workers en 4 cuando no hay override", () => {
    expect(maxWorkersVerify({})).toBe(4);
  });

  it("respeta el override explícito del box o de una corrida local", () => {
    expect(maxWorkersVerify({ VITEST_MAX_WORKERS: "4" })).toBe(4);
    expect(maxWorkersVerify({ VITEST_MAX_WORKERS: "2" })).toBe(2);
    // Vitest parsea con parseInt: "2x" también da 2, no lo cambiamos acá.
    expect(maxWorkersVerify({ VITEST_MAX_WORKERS: "2x" })).toBe(2);
  });

  it("un valor vacío o inválido no deja la suite sin tope", () => {
    expect(maxWorkersVerify({ VITEST_MAX_WORKERS: "" })).toBe(4);
    expect(maxWorkersVerify({ VITEST_MAX_WORKERS: "many" })).toBe(4);
    expect(maxWorkersVerify({ VITEST_MAX_WORKERS: "0" })).toBe(4);
  });
});

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

describe("verify: mensajes del resumidor", () => {
  function conFalloTest() {
    return planDePasos().map((p) => {
      if (p.nombre === "test") return { nombre: p.nombre, code: 1 };
      if (p.nombre === "skips") return { nombre: p.nombre, skipped: true, motivo: "porque falló test" };
      return { nombre: p.nombre, code: 0 };
    });
  }

  it("nombra los tests fallidos leyendo el reporte JSON de Vitest", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-reporte-"));
    const reporte = join(dir, "report.json");
    writeFileSync(
      reporte,
      JSON.stringify({
        testResults: [
          {
            assertionResults: [
              { fullName: "suite > caso rojo", status: "failed" },
              { fullName: "suite > caso verde", status: "passed" },
            ],
          },
        ],
      }),
    );
    const txt = textoResumen(resumir(conFalloTest()), { rutaRecibo: null, reporte });
    expect(txt).toContain("verify falló en: test");
    expect(txt).toContain("suite > caso rojo");
    expect(txt).not.toContain("caso verde");
    expect(txt).toContain(reporte);
    expect(txt).toMatch(/node -e .*assertionResults/);
  });

  it("nombra la suite fallida cuando el fallo es de hook y no hay asserts fallidos", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-suite-"));
    const reporte = join(dir, "report.json");
    writeFileSync(
      reporte,
      JSON.stringify({ testResults: [{ name: "tests/hook-roto.test.ts", status: "failed", assertionResults: [] }] }),
    );
    const txt = textoResumen(resumir(conFalloTest()), { rutaRecibo: null, reporte });
    expect(txt).toContain("suites fallidas");
    expect(txt).toContain("tests/hook-roto.test.ts");
  });

  it("da la ruta y el comando concreto cuando el reporte no es legible", () => {
    const txt = textoResumen(resumir(conFalloTest()), { rutaRecibo: null, reporte: "no-existe.json" });
    expect(txt).toContain("no-existe.json");
    expect(txt).toMatch(/node -e .*assertionResults/);
  });

  it("distingue el paso omitido del fallido, con motivo inline", () => {
    const txt = textoResumen(resumir(conFalloTest()), { rutaRecibo: null, reporte: "no-existe.json" });
    expect(txt).toContain("verify omitió skips");
    expect(txt).toContain("porque falló test");
    expect(txt).not.toContain("motivo en el recibo");
  });

  it("solo menciona el recibo si se escribió", () => {
    const r = resumir(conFalloTest());
    const sin = textoResumen(r, { rutaRecibo: null, reporte: "no-existe.json" });
    const con = textoResumen(r, { rutaRecibo: ".verify-receipt.json", reporte: "no-existe.json" });
    expect(sin).not.toMatch(/recibo/i);
    expect(con).toContain(".verify-receipt.json");
  });

  it("sin fallos conserva verify ok (18 pasos)", () => {
    const todos = planDePasos().map((p) => ({ nombre: p.nombre, code: 0 }));
    expect(todos).toHaveLength(18);
    expect(textoResumen(resumir(todos))).toBe(`verify ok (${todos.length} pasos)`);
  });
});
