import { describe, expect, it } from "vitest";
import {
  compararBaselines,
  resumir,
  resumirVitestJson,
  testsCambiados,
} from "../scripts/evidencia.mjs";

const TSC_ERROR = `tests/nivel5-admin.test.ts(17,25): error TS2322: Type '{ headers: {}; }' is not assignable to type 'RequestInit'.
src/lib/repos/caja.ts(12,3): error TS2305: Module has no exported member.`;

const VITEST_OK = [
  "",
  " RUN  v2.1.9 /workspace/si-llm",
  "",
  " \u001b[32m✓\u001b[39m tests/pagos.test.ts (10 tests) 12ms",
  "",
  " \u001b[32m Test Files\u001b[39m  \u001b[1m\u001b[32m 1 passed (1)\u001b[39m\u001b[22m",
  " \u001b[32m      Tests\u001b[39m  \u001b[1m\u001b[32m 10 passed (10)\u001b[39m\u001b[22m",
  "   Start at  03:00:00",
  "",
].join("\n");

const BUILD_OK = ["06:00:00 [\u001b[32mbuild\u001b[39m] Complete! Built in 12.3s.", ""].join("\n");

describe("evidencia resumir", () => {
  it("cita verbatim los errores de tsc", () => {
    const md = resumir({ tsc: TSC_ERROR, vitest: VITEST_OK, build: BUILD_OK, sha: "abc1234" });
    expect(md).toContain("tests/nivel5-admin.test.ts(17,25): error TS2322");
    expect(md).toContain("src/lib/repos/caja.ts(12,3): error TS2305");
    expect(md).not.toContain("0 errores");
    expect(md).toContain("abc1234");
  });

  it("tsc limpio informa 0 errores", () => {
    const md = resumir({ tsc: "", vitest: VITEST_OK, build: BUILD_OK, sha: "abc1234" });
    expect(md).toContain("0 errores");
  });

  it("vitest sale sin ANSI con Test Files y Tests", () => {
    const md = resumir({ tsc: "", vitest: VITEST_OK, build: BUILD_OK, sha: "abc1234" });
    expect(md).toContain("Test Files");
    expect(md).toContain("Tests");
    expect(md).toContain("1 passed (1)");
    expect(md).toContain("10 passed (10)");
    expect(md).not.toContain("\u001b[");
  });

  it("build cita la línea Complete verbatim", () => {
    const md = resumir({ tsc: "", vitest: VITEST_OK, build: BUILD_OK, sha: "abc1234" });
    expect(md).toContain("Complete!");
  });

  it("sale como bullets markdown", () => {
    const md = resumir({ tsc: "", vitest: VITEST_OK, build: BUILD_OK, sha: "abc1234" });
    for (const linea of md.trim().split("\n")) {
      expect(linea.startsWith("- ")).toBe(true);
    }
  });
});

const VITEST_JSON_OK = {
  numTotalTestSuites: 1,
  numPassedTestSuites: 1,
  numFailedTestSuites: 0,
  numTotalTests: 10,
  numPassedTests: 10,
  numFailedTests: 0,
};

const VITEST_JSON_FAIL = {
  numTotalTestSuites: 3,
  numPassedTestSuites: 2,
  numFailedTestSuites: 1,
  numTotalTests: 10,
  numPassedTests: 8,
  numFailedTests: 2,
};

describe("evidencia resumirVitestJson", () => {
  it("devuelve el mismo texto que el resumen de texto cuando todo pasa", () => {
    const md = resumir({ tsc: "", vitest: VITEST_OK, build: BUILD_OK, sha: "x" });
    const norm = (s: string) => s.replace(/\s+/g, " ");
    const esperadas = md.split("\n").filter((l) => l.startsWith("- vitest:"));
    expect(resumirVitestJson(VITEST_JSON_OK).trim().split("\n").map(norm)).toEqual(
      esperadas.map(norm),
    );
  });

  it("cita failed si hay suites o tests fallidos", () => {
    const md = resumirVitestJson(VITEST_JSON_FAIL);
    expect(md).toContain("- vitest: `Test Files  1 failed | 2 passed (3)`");
    expect(md).toContain("- vitest: `Tests  2 failed | 8 passed (10)`");
  });
});

describe("evidencia testsCambiados", () => {
  it("filtra solo archivos *.test.ts", () => {
    expect(
      testsCambiados(["src/a.ts", "tests/x.test.ts", "docs/y.md", "tests/arch/z.test.ts"]),
    ).toEqual(["tests/x.test.ts", "tests/arch/z.test.ts"]);
  });

  it("acepta la salida cruda de git diff --name-only", () => {
    expect(testsCambiados("src/a.ts\ntests/x.test.ts\n")).toEqual(["tests/x.test.ts"]);
  });
});

describe("evidencia compararBaselines", () => {
  it("lista antes -> despues y marca sin cambio", () => {
    const md = compararBaselines({ a: 1, b: 2 }, { a: 1, b: 3 });
    expect(md).toContain("- baseline a: 1 -> 1 (sin cambio)");
    expect(md).toContain("- baseline b: 2 -> 3");
    expect(md).not.toContain("b: 2 -> 3 (sin cambio)");
  });
});

describe("evidencia resumir con secciones opcionales", () => {
  it("usa vitestJson en vez del texto y agrega cambiados y baselines", () => {
    const md = resumir({
      tsc: "",
      vitest: "",
      build: BUILD_OK,
      sha: "abc1234",
      vitestJson: VITEST_JSON_OK,
      cambiados: ["tests/x.test.ts"],
      baselinesAntes: { a: 1 },
      baselinesDespues: { a: 2 },
    });
    expect(md).toContain("- vitest: `Test Files  1 passed (1)`");
    expect(md).toContain("- vitest: `Tests  10 passed (10)`");
    expect(md).not.toContain("sin resumen");
    expect(md).toContain("tests/x.test.ts");
    expect(md).toContain("- baseline a: 1 -> 2");
    for (const linea of md.trim().split("\n")) {
      expect(linea.startsWith("- ")).toBe(true);
    }
  });
});

describe("evidencia resumirVitestJson con testResults", () => {
  it("cuenta archivos desde testResults y no bloques describe", () => {
    const md = resumirVitestJson({
      numTotalTestSuites: 9,
      numPassedTestSuites: 8,
      numFailedTestSuites: 1,
      numTotalTests: 5,
      numPassedTests: 4,
      numFailedTests: 1,
      testResults: [{ status: "passed" }, { status: "failed" }],
    });
    expect(md).toContain("Test Files  1 failed | 1 passed (2)");
    expect(md).toContain("Tests  1 failed | 4 passed (5)");
  });
});
