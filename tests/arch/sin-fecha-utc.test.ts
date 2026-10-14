import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PATRONES: ReadonlyArray<RegExp> = [
  /toISOString\(\)\.slice\(0,\s*10\)/,
  /toISOString\(\)\.split\(\s*["']T["']\s*\)\s*\[\s*0\s*\]/,
];

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".astro")) out.push(p);
  }
  return out;
}

describe("ARQ-S2 sin fecha UTC como día local", () => {
  it("src no usa el día UTC como día de Buenos Aires", () => {
    const mal: string[] = [];
    for (const f of archivos("src")) {
      const lineas = readFileSync(f, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        if (PATRONES.some((re) => re.test(linea))) mal.push(`${f}:${i + 1}`);
      });
    }
    expect(mal, mal.join("\n")).toEqual([]);
  });
});
