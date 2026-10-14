import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RX_ONLINE = /\bonline\s*:\s*(true|false)\b/;

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (p.endsWith(".ts") || p.endsWith(".astro")) out.push(p);
  }
  return out;
}

export function tieneOnlineLiteral(linea: string): boolean {
  return RX_ONLINE.test(linea);
}

describe("E8 sin online literal en repos ni rutas", () => {
  it("online solo viene del gate (src/lib/offline-gate.ts)", () => {
    const dirs = [join("src", "pages", "api"), join("src", "lib", "repos")];
    const mal: string[] = [];
    for (const d of dirs) {
      for (const f of archivos(d)) {
        const lineas = readFileSync(f, "utf8").split("\n");
        lineas.forEach((linea, i) => {
          if (tieneOnlineLiteral(linea)) mal.push(`${f.replace(/\\/g, "/")}:${i + 1}: ${linea.trim()}`);
        });
      }
    }
    expect(
      mal,
      mal.length > 0
        ? `online literal prohibido: online debe venir del gate src/lib/offline-gate.ts, no de un literal:\n${mal.join("\n")}`
        : "",
    ).toEqual([]);
  });
});
