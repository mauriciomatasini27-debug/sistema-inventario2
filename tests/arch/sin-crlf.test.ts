import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function hayGit(): boolean {
  try {
    execFileSync("git", ["--version"], { cwd: RAIZ, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("ARQ-S3 sin CRLF en el repo", () => {
  it("git ls-files --eol no muestra crlf ni mixed en índice o worktree", () => {
    if (!hayGit()) {
      console.warn("sin git disponible: se omite el control de CRLF");
      return;
    }
    let salida: string;
    try {
      salida = execFileSync("git", ["ls-files", "--eol"], { cwd: RAIZ, encoding: "utf8" });
    } catch {
      console.warn("sin git disponible: se omite el control de CRLF");
      return;
    }
    const mal: string[] = [];
    for (const linea of salida.split("\n")) {
      if (!linea.trim()) continue;
      const m = /^(\S+)\s+(\S+)\s/.exec(linea);
      const archivo = linea.split("\t").pop()?.trim() ?? linea;
      const eolIndice = m?.[1]?.startsWith("i/") === true ? m[1].slice(2) : "";
      const eolWorktree = m?.[2]?.startsWith("w/") === true ? m[2].slice(2) : "";
      if (eolIndice === "crlf" || eolIndice === "mixed" || eolWorktree === "crlf" || eolWorktree === "mixed") {
        mal.push(`${archivo} (i/${eolIndice} w/${eolWorktree})`);
      }
    }
    expect(mal, mal.join("\n")).toEqual([]);
  });
});
