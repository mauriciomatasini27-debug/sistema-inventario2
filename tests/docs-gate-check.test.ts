import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { modoChequeo } from "../scripts/rama-lib.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLI_ESTADO = join(AQUI, "..", "scripts", "docs-estado.mjs");

function correr(cli: string, cwd: string, args: string[]): { estado: number; salida: string } {
  try {
    const out = execFileSync(process.execPath, [cli, ...args], { stdio: "pipe", encoding: "utf8", cwd });
    return { estado: 0, salida: String(out) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { estado: err.status ?? 99, salida: String(err.stdout ?? "") + String(err.stderr ?? "") };
  }
}

function avance(item: string): string {
  return `---\nitem: ${item}\nestado: hecho\nfecha: 2026-10-15\n---\n${item}: una línea de avance.\n`;
}

// DOCS-GATE-CHECK: el check exige frescura en main y se omite en rama de trabajo.
describe("DOCS-GATE-CHECK", () => {
  it("modoChequeo: main chequea, rama de trabajo salta, sin git cae a chequear", () => {
    expect(modoChequeo({ rama: "main" })).toBe("chequear");
    expect(modoChequeo({ rama: "mauri/x" })).toBe("saltar");
    expect(modoChequeo({ rama: "" })).toBe("chequear");
  });

  it("en main el --check falla nombrando el comando y pasa al día", () => {
    const repo = mkdtempSync(join(tmpdir(), "gate-check-"));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
    const docs = join(repo, "docs");
    mkdirSync(join(docs, "roadmap", "avances"), { recursive: true });
    writeFileSync(join(docs, "roadmap", "avances", "P1-1.md"), avance("P1-1"));
    writeFileSync(join(repo, "x.txt"), "x");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repo });
    expect(correr(CLI_ESTADO, repo, ["--raiz", docs]).estado).toBe(0);
    expect(correr(CLI_ESTADO, repo, ["--raiz", docs, "--check"]).salida).toContain("docs:estado al día");
    writeFileSync(join(docs, "roadmap", "avances", "P1-2.md"), avance("P1-2"));
    const rancio = correr(CLI_ESTADO, repo, ["--raiz", docs, "--check"]);
    expect(rancio.estado).toBe(1);
    expect(rancio.salida).toContain("npm run docs:estado");
  });

  it("en rama de trabajo el --check se omite aunque el generado esté rancio", () => {
    const repo = mkdtempSync(join(tmpdir(), "gate-check-"));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
    const docs = join(repo, "docs");
    mkdirSync(join(docs, "roadmap", "avances"), { recursive: true });
    writeFileSync(join(docs, "roadmap", "avances", "P1-1.md"), avance("P1-1"));
    writeFileSync(join(repo, "x.txt"), "x");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repo });
    execFileSync("git", ["checkout", "-q", "-b", "mauri/x"], { cwd: repo });
    writeFileSync(join(docs, "roadmap", "avances", "P1-2.md"), avance("P1-2"));
    const omitido = correr(CLI_ESTADO, repo, ["--raiz", docs, "--check"]);
    expect(omitido.estado).toBe(0);
    expect(omitido.salida).toContain("se omite");
  });
});
