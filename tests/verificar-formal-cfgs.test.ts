import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR_TLA = join("verificacion", "tla");
const SCRIPT = join("scripts", "verificar-formal.sh");

function configsDelScript(): Set<string> {
  const texto = readFileSync(SCRIPT, "utf8");
  const out = new Set<string>();
  for (const m of texto.matchAll(/correr_(?:ok|quiebre)\s+"[^"]+"\s+"([^"]+)"/g)) {
    out.add(m[1]!);
  }
  return out;
}

describe("verificar:formal corre todos los .cfg", () => {
  it("cada config de verificacion/tla tiene su linea correr_ok/correr_quiebre", () => {
    const cfgs = readdirSync(DIR_TLA)
      .filter((f) => f.endsWith(".cfg"))
      .map((f) => f.slice(0, -".cfg".length))
      .sort();
    const enScript = configsDelScript();
    const faltan = cfgs.filter((c) => !enScript.has(c));
    expect(faltan, `configs sin linea en ${SCRIPT}: ${faltan.join(", ")}`).toEqual([]);
  });
});
