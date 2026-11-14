import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const PERMITIDOS = new Set(["src/db/schema.ts", "src/lib/repos/movimientos-caja.ts"]);

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivosTs(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function aPosix(p: string): string {
  return relative(process.cwd(), p).split(sep).join("/");
}

describe("ADR-0116 C5 dueño de cashMovements", () => {
  it("src solo nombra cashMovements en el schema y en movimientos-caja", () => {
    const mal: string[] = [];
    for (const f of archivosTs("src")) {
      const rel = aPosix(f);
      if (PERMITIDOS.has(rel)) continue;
      const lineas = readFileSync(f, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        if (/\bcashMovements\b/.test(linea)) mal.push(`${rel}:${i + 1}`);
      });
    }
    expect(mal, mal.join("\n")).toEqual([]);
  });
});
