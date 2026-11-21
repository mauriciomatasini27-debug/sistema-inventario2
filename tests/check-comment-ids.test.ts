import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLI = join(AQUI, "..", "scripts", "check-comment-ids.mjs");
const RULE_JSON = join(AQUI, "..", "scripts", "comment-rule-base.json");

function correr(cwd: string, args: string[] = [], env: NodeJS.ProcessEnv = {}): { estado: number; salida: string } {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], {
      stdio: "pipe",
      encoding: "utf8",
      cwd,
      env: { ...process.env, ...env },
    });
    return { estado: 0, salida: String(out) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { estado: err.status ?? 99, salida: String(err.stdout ?? "") + String(err.stderr ?? "") };
  }
}

function repoGit(nombre: string) {
  const repo = mkdtempSync(join(tmpdir(), nombre));
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "tests"), { recursive: true });
  copyFileSync(CLI, join(repo, "scripts", "check-comment-ids.mjs"));
  writeFileSync(join(repo, "scripts", "comment-rule-base.json"), JSON.stringify({ base: "" }));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
  return repo;
}

function commitTodo(repo: string, mensaje: string) {
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-q", "-m", mensaje], { cwd: repo });
}

describe("check-comment-ids", () => {
  it("falla con mensaje claro si la base no existe", () => {
    const repo = repoGit("cci-base-");
    writeFileSync(join(repo, "src", "x.ts"), "export const x = 1;\n");
    commitTodo(repo, "init");
    const r = correr(repo, ["0000000000000000000000000000000000000000"]);
    expect(r.estado).toBe(1);
    expect(r.salida).toContain("la base no existe");
    expect(r.salida).not.toContain("check-comment-ids ok");
  });

  it("usa merge-base con main y falla un comentario nuevo sin clase en src/", () => {
    const repo = repoGit("cci-src-");
    writeFileSync(join(repo, "src", "ok.ts"), "export const ok = 1;\n");
    commitTodo(repo, "main");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(
      join(repo, "src", "nuevo.ts"),
      "// TB-165: esto no tiene clase.\nexport const n = 1;\n",
    );
    const r = correr(repo);
    expect(r.estado).toBe(1);
    expect(r.salida).toContain("sin clase ADR-0064");
    expect(r.salida).toContain("src/nuevo.ts");
    expect(r.salida).toMatch(/1 problema\(s\)/);
    expect(r.salida).toContain("BORRAR el comentario");
  });

  it("no aplica la regla de clase en tests/ ni en .md", () => {
    const repo = repoGit("cci-out-");
    writeFileSync(join(repo, "src", "ok.ts"), "export const ok = 1;\n");
    commitTodo(repo, "main");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(join(repo, "tests", "t.test.ts"), "// TB-165: sin clase en test.\nexport {};\n");
    writeFileSync(join(repo, "src", "nota.md"), "// TB-165: sin clase en md.\n");
    const r = correr(repo);
    expect(r.estado).toBe(0);
    expect(r.salida).toContain("check-comment-ids ok");
  });

  it("respeta COMMENT_CHECK_BASE como override de la base", () => {
    const repo = repoGit("cci-env-");
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
    commitTodo(repo, "c1");
    const baseC1 = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: repo }).trim();
    writeFileSync(
      join(repo, "src", "b.ts"),
      "// TB-165: legado sin clase en main.\nexport const b = 1;\n",
    );
    commitTodo(repo, "c2");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(
      join(repo, "src", "c.ts"),
      "// TB-165 [tenant]: comentario válido.\nexport const c = 1;\n",
    );
    commitTodo(repo, "feat");
    const bien = correr(repo);
    expect(bien.estado).toBe(0);
    const mal = correr(repo, [], { COMMENT_CHECK_BASE: baseC1 });
    expect(mal.estado).toBe(1);
    expect(mal.salida).toContain("src/b.ts");
  });
});

describe("check-comment-ids en el repo real", () => {
  it("pasa con merge-base por defecto (sin base fija en comment-rule-base.json)", () => {
    const raiz = join(AQUI, "..");
    const regla = JSON.parse(readFileSync(RULE_JSON, "utf8")) as { base?: string };
    expect(regla.base ?? "").toBe("");
    let base = "";
    try {
      base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { encoding: "utf8", cwd: raiz }).trim();
    } catch {
      base = execFileSync("git", ["merge-base", "HEAD", "main"], { encoding: "utf8", cwd: raiz }).trim();
    }
    const r = correr(raiz);
    expect(r.estado).toBe(0);
    expect(r.salida).toContain(`base ${base}`);
  });
});