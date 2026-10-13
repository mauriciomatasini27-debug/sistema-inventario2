import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("PERS2-AT5 sin fallback a memoria fuera del helper central", () => {
  it("ninguna ruta ni módulo define su propio dbViva() que trague errores de base", () => {
    const permitidos = new Set(["src/lib/server-db.ts", "src/lib/fiscal-db.ts"]);
    const mal = [...archivos("src/pages/api"), ...archivos("src/modules"), ...archivos("src/lib")]
      .filter((f) => !permitidos.has(f))
      .filter((f) => /function\s+dbViva\s*\(/.test(readFileSync(f, "utf8")));
    expect(mal).toEqual([]);
  });

  it("ninguna ruta llama getTenantDb() dentro de un try/catch propio para caer a memoria", () => {
    const mal = archivos("src/pages/api").filter((f) =>
      /try\s*\{\s*return\s+getTenantDb\(/.test(readFileSync(f, "utf8")),
    );
    expect(mal).toEqual([]);
  });
});
