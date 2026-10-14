import { describe, expect, it } from "vitest";
import { resumir } from "../scripts/evidencia.mjs";

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
