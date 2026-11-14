import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const EXCLUIDOS = new Set(["src/db/schema.ts"]);
const TABLAS = ["outbox", "idMappings"] as const;

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

describe("ADR-0116 SQL de outbox e id_mappings", () => {
  it("cada lectura filtra tenant y cada alta lo sella", () => {
    const mal: string[] = [];
    for (const f of archivosTs("src")) {
      const rel = aPosix(f);
      if (EXCLUIDOS.has(rel)) continue;
      const texto = readFileSync(f, "utf8");
      const sellos =
        (texto.match(/tenantIdShared\(/g)?.length ?? 0) +
        (texto.match(/tenantIdAlSellar\(/g)?.length ?? 0) +
        (texto.match(/filaConTenant\(/g)?.length ?? 0);
      for (const tabla of TABLAS) {
        const lecturas = texto.match(new RegExp(`\\.(?:from|update)\\(${tabla}\\b`, "g"))?.length ?? 0;
        const altas = texto.match(new RegExp(`\\.insert\\(${tabla}\\)`, "g"))?.length ?? 0;
        if (lecturas === 0 && altas === 0) continue;
        const filtros = texto.match(new RegExp(`dondeTenant\\(${tabla}\\.tenantId`, "g"))?.length ?? 0;
        if (lecturas > filtros || (altas > 0 && sellos < 1)) {
          mal.push(`${rel} ${tabla} lecturas=${lecturas} filtros=${filtros} altas=${altas} sellos=${sellos}`);
        }
      }
    }
    expect(mal, mal.join("\n")).toEqual([]);
  });
});
