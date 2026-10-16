import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function disparadores(yml: string): string[] {
  const lineas = yml.replace(/\r\n/g, "\n").split("\n");
  const i = lineas.findIndex((l) => /^on:\s*$/.test(l));
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < lineas.length; j++) {
    const l = lineas[j] ?? "";
    if (l.trim() === "") continue;
    if (!/^\s/.test(l)) break;
    const m = /^\s+([A-Za-z_]+):/.exec(l);
    const nombre = m?.[1];
    if (nombre) out.push(nombre);
  }
  return out;
}

describe("workflows sin disparadores automáticos", () => {
  it("todos los workflows son solo workflow_dispatch", () => {
    const dir = join(".github", "workflows");
    const malos: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".yml") || x.endsWith(".yaml"))) {
      const disp = disparadores(readFileSync(join(dir, f), "utf8"));
      const ok = disp.length === 1 && disp[0] === "workflow_dispatch";
      if (!ok) malos.push(`${f} -> ${disp.join(", ") || "(ninguno)"}`);
    }
    expect(malos, `workflows con disparadores automáticos (deben ser workflow_dispatch):\n${malos.join("\n")}`).toEqual([]);
  });
});
