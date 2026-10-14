import { describe, expect, it } from "vitest";
import { analizarReporte } from "../scripts/check-skips.mjs";

const limpio = {
  numTotalTests: 2,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [
    {
      name: "tests/a.test.ts",
      status: "passed",
      assertionResults: [
        { fullName: "A uno", title: "uno", status: "passed" },
        { fullName: "A dos", title: "dos", status: "passed" },
      ],
    },
  ],
};

const conSkips = {
  numTotalTests: 3,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 1,
  numTodoTests: 0,
  testResults: [
    {
      name: "tests/b.test.ts",
      status: "passed",
      assertionResults: [
        { fullName: "B uno", title: "uno", status: "passed" },
        { fullName: "B pg sin base", title: "pg sin base", status: "skipped" },
      ],
    },
  ],
};

describe("check-skips", () => {
  it("reporte limpio => ok sin saltados", () => {
    const r = analizarReporte(limpio);
    expect(r.saltados).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("numPendingTests > 0 => no ok y lista el test", () => {
    const r = analizarReporte(conSkips);
    expect(r.ok).toBe(false);
    expect(r.saltados).toHaveLength(1);
    expect(r.saltados[0]).toContain("tests/b.test.ts");
    expect(r.saltados[0]).toContain("B pg sin base");
  });

  it("numTodoTests > 0 => no ok", () => {
    const r = analizarReporte({ ...limpio, numTodoTests: 2, numPendingTests: 0 });
    expect(r.ok).toBe(false);
  });

  it("suite entera skipped => no ok aunque el contador venga en cero", () => {
    const r = analizarReporte({
      ...limpio,
      testResults: [{ name: "tests/c.test.ts", status: "skipped", assertionResults: [] }],
    });
    expect(r.ok).toBe(false);
    expect(r.saltados.some((s) => s.includes("tests/c.test.ts"))).toBe(true);
  });

  it("status pending en assert también cuenta como skip", () => {
    const r = analizarReporte({
      ...limpio,
      testResults: [
        {
          name: "tests/d.test.ts",
          status: "passed",
          assertionResults: [{ fullName: "D pendiente", title: "pendiente", status: "pending" }],
        },
      ],
    });
    expect(r.ok).toBe(false);
  });
});
