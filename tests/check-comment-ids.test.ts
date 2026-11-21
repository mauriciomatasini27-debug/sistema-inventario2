import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const CLI = join(RAIZ, "scripts", "check-comment-ids.mjs");
const RULE_JSON = join(RAIZ, "scripts", "comment-rule-base.json");
const LIBS = [
  "comentarios-politica.mjs",
  "comentarios-ids-lib.mjs",
  "comentarios-scan-lib.mjs",
  "comentarios-typescript-scanner.mjs",
];

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

function seedIds(repo: string) {
  const av = join(repo, "docs", "roadmap", "avances");
  mkdirSync(av, { recursive: true });
  writeFileSync(
    join(av, "TB-165.md"),
    `---
item: TB-165
estado: hecho
adr: ADR-0064
prd: PRD-COM-01
fecha: 2026-11-21
---
TB-165
`,
  );
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "docs", "graph.json"), JSON.stringify({ nodos: [{ id: "P10-24" }] }));
  writeFileSync(join(repo, "docs", "ROADMAP.md"), "| P10-24 | hecho |\n");
}

function repoGit(nombre: string) {
  const repo = mkdtempSync(join(tmpdir(), nombre));
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(repo, "src"), { recursive: true });
  copyFileSync(CLI, join(repo, "scripts", "check-comment-ids.mjs"));
  for (const lib of LIBS) {
    copyFileSync(join(RAIZ, "scripts", lib), join(repo, "scripts", lib));
  }
  writeFileSync(join(repo, "scripts", "comment-rule-base.json"), JSON.stringify({ base: "" }));
  seedIds(repo);
  const nm = join(repo, "node_modules");
  mkdirSync(join(nm, "typescript"), { recursive: true });
  execFileSync("cp", ["-a", join(RAIZ, "node_modules", "typescript", "."), join(nm, "typescript")]);
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
  });

  it("rechaza id inexistente y no trata ISO8601 como id", () => {
    const repo = repoGit("cci-id-");
    writeFileSync(join(repo, "src", "ok.ts"), "export const ok = 1;\n");
    commitTodo(repo, "main");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(
      join(repo, "src", "mal.ts"),
      "// ISO8601 [tenant]: fecha en formato estándar.\nexport const n = 1;\n",
    );
    const r = correr(repo);
    expect(r.estado).toBe(1);
    expect(r.salida).toMatch(/Nombrá un id|Usá un id registrado/);
    expect(r.salida).not.toContain("ISO8601");
  });

  it("falla comentario nuevo sin clase con mensaje positivo", () => {
    const repo = repoGit("cci-src-");
    writeFileSync(join(repo, "src", "ok.ts"), "export const ok = 1;\n");
    commitTodo(repo, "main");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(join(repo, "src", "nuevo.ts"), "// TB-165: esto no tiene clase.\nexport const n = 1;\n");
    const r = correr(repo);
    expect(r.estado).toBe(1);
    expect(r.salida).toContain("Escribí el porqué en una línea");
    expect(r.salida).toContain("[rol]");
  });

  it("acepta [rol] con id registrado", () => {
    const repo = repoGit("cci-rol-");
    writeFileSync(join(repo, "src", "ok.ts"), "export const ok = 1;\n");
    commitTodo(repo, "main");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(
      join(repo, "src", "c.ts"),
      "// TB-165 [rol]: el Empleado no entra al panel de dueño.\nexport const c = 1;\n",
    );
    const r = correr(repo);
    expect(r.estado).toBe(0);
  });

  it("falla JSDoc nuevo con objetivo positivo primero", () => {
    const repo = repoGit("cci-jsdoc-");
    writeFileSync(join(repo, "src", "ok.ts"), "export const ok = 1;\n");
    commitTodo(repo, "main");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(join(repo, "src", "d.ts"), "/** nuevo */\nexport const d = 1;\n");
    const r = correr(repo);
    expect(r.estado).toBe(1);
    expect(r.salida).toMatch(/Escribí el porqué en una línea/);
    expect(r.salida).toMatch(/no JSDoc/);
    expect(r.salida).not.toMatch(/^check-comment.*JSDoc no permitido/m);
  });

  it("no marca // dentro de string", () => {
    const repo = repoGit("cci-str-");
    writeFileSync(join(repo, "src", "ok.ts"), 'export const u = "http://x"; // TB-165 [tenant]: ok\n');
    commitTodo(repo, "main");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(join(repo, "src", "s.ts"), 'export const s = "protocol // host";\n');
    const r = correr(repo);
    expect(r.estado).toBe(0);
  });

  it("detecta comentario al final de línea", () => {
    const repo = repoGit("cci-eol-");
    writeFileSync(join(repo, "src", "ok.ts"), "export const ok = 1;\n");
    commitTodo(repo, "main");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(join(repo, "src", "e.ts"), "export const e = 1; // TB-165 [plataforma]: trailing\n");
    const r = correr(repo);
    expect(r.estado).toBe(0);
    expect(r.salida).toContain("check-comment-ids ok");
  });

  it("no aplica en tests/", () => {
    const repo = repoGit("cci-out-");
    writeFileSync(join(repo, "src", "ok.ts"), "export const ok = 1;\n");
    commitTodo(repo, "main");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    mkdirSync(join(repo, "tests"), { recursive: true });
    writeFileSync(join(repo, "tests", "t.test.ts"), "// sin clase\nexport {};\n");
    const r = correr(repo);
    expect(r.estado).toBe(0);
  });

  it("respeta COMMENT_CHECK_BASE", () => {
    const repo = repoGit("cci-env-");
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
    commitTodo(repo, "c1");
    const baseC1 = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: repo }).trim();
    writeFileSync(join(repo, "src", "b.ts"), "// TB-165: legado sin clase.\nexport const b = 1;\n");
    commitTodo(repo, "c2");
    execFileSync("git", ["checkout", "-q", "-b", "feat"], { cwd: repo });
    writeFileSync(join(repo, "src", "c.ts"), "// TB-165 [tenant]: válido.\nexport const c = 1;\n");
    commitTodo(repo, "feat");
    expect(correr(repo).estado).toBe(0);
    const mal = correr(repo, [], { COMMENT_CHECK_BASE: baseC1 });
    expect(mal.estado).toBe(1);
    expect(mal.salida).toContain("b.ts");
  });
});

describe("check-comment-ids en el repo real", () => {
  it("pasa con merge-base por defecto", () => {
    const regla = JSON.parse(readFileSync(RULE_JSON, "utf8")) as { base?: string };
    expect(regla.base ?? "").toBe("");
    const r = correr(RAIZ);
    expect(r.estado).toBe(0);
  });
});

describe("docs:comentarios", () => {
  it("pasa cuando AGENTS y skill están sincronizados", () => {
    const r = execFileSync("node", [join(RAIZ, "scripts", "docs-comentarios.mjs"), "--check"], {
      encoding: "utf8",
      cwd: RAIZ,
    });
    expect(r).toContain("al día");
  });

  it("falla con mensaje positivo si el bloque está desactualizado", () => {
    const agents = readFileSync(join(RAIZ, "AGENTS.md"), "utf8");
    const tmp = mkdtempSync(join(tmpdir(), "docs-com-"));
    mkdirSync(join(tmp, "scripts"), { recursive: true });
    mkdirSync(join(tmp, ".agents/skills/delete-comment"), { recursive: true });
    copyFileSync(join(RAIZ, "scripts", "docs-comentarios.mjs"), join(tmp, "scripts/docs-comentarios.mjs"));
    copyFileSync(join(RAIZ, "scripts", "comentarios-politica.mjs"), join(tmp, "scripts/comentarios-politica.mjs"));
    copyFileSync(join(RAIZ, "scripts", "rama-lib.mjs"), join(tmp, "scripts/rama-lib.mjs"));
    writeFileSync(join(tmp, "AGENTS.md"), agents.replace("P10-24", "P10-99-stale"));
    copyFileSync(join(RAIZ, ".agents/skills/delete-comment/SKILL.md"), join(tmp, ".agents/skills/delete-comment/SKILL.md"));
    expect(() =>
      execFileSync("node", ["scripts/docs-comentarios.mjs", "--check"], {
        cwd: tmp,
        encoding: "utf8",
      }),
    ).toThrow();
    try {
      execFileSync("node", ["scripts/docs-comentarios.mjs", "--check"], {
        cwd: tmp,
        encoding: "utf8",
      });
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string };
      const out = String(err.stderr ?? "") + String(err.stdout ?? "");
      expect(out).toContain("bloque de comentarios desactualizado");
      expect(out).toContain("npm run docs:comentarios");
    }
  });
});