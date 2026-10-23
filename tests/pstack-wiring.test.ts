import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAIN_SUITE = "Pstack con agentes nombrados (PRD-PS-01, ADR-0085)";
const MAIN_FILTER = "Pstack con agentes nombrados";
const SHEET_POINTER = ".opencode/pstack-models.md";
const RUNNER = ".opencode/pstack-run.sh";
const AGENTS = ["pstack-worker", "pstack-judge"];
const REMOVED_AGENTS = ["poteto-agent", "comment-sicko"];
const FILE_PROMPT = /^\{file:(.+)\}$/;
const BANNED_MODELS = ["auto", "inherit-parent"];

type AgentEntry = { mode?: string; model?: string; prompt?: string };
type PstackConfig = {
  instructions?: unknown;
  agent?: Record<string, AgentEntry | undefined>;
};
type MutableConfig = { instructions: string[]; agent: Record<string, AgentEntry> };

function readConfig(root: string): PstackConfig {
  return JSON.parse(readFileSync(join(root, "opencode.json"), "utf8")) as PstackConfig;
}

function checkConfig(root: string): void {
  const cfg = readConfig(root);
  expect(cfg.instructions).toEqual(expect.arrayContaining([SHEET_POINTER]));
  for (const name of AGENTS) {
    expect(cfg.agent?.[name]?.mode).toBe("subagent");
    expect(cfg.agent?.[name]?.model ?? "").not.toBe("");
    expect(BANNED_MODELS).not.toContain(cfg.agent?.[name]?.model);
  }
  for (const name of REMOVED_AGENTS) expect(cfg.agent?.[name], name).toBeUndefined();
  for (const [name, entry] of Object.entries(cfg.agent ?? {})) {
    const ref = FILE_PROMPT.exec(entry?.prompt ?? "")?.[1];
    if (ref) expect(existsSync(join(root, ref)), `${name} -> ${ref}`).toBe(true);
  }
}

function checkSheet(root: string): void {
  const sheetPath = join(root, SHEET_POINTER);
  expect(existsSync(sheetPath)).toBe(true);
  const sheet = readFileSync(sheetPath, "utf8");
  expect(sheet).toContain("feature, refactoring: pstack-worker");
  expect(sheet).toContain("judgment and prose: pstack-judge");
  expect(sheet).toContain("arena runners: pstack-worker, pstack-judge");
  for (const name of REMOVED_AGENTS) expect(sheet).not.toContain(name);
  for (const line of sheet.split("\n")) {
    if (line.trimStart().startsWith("#") || !line.includes(":")) continue;
    const values = line.split(":").slice(1).join(":");
    for (const token of values.split(",")) {
      expect(BANNED_MODELS).not.toContain(token.trim());
    }
  }
}

function checkRunner(root: string): void {
  expect(existsSync(join(root, RUNNER))).toBe(true);
}

function checkPstackWiring(root: string): void {
  checkConfig(root);
  checkSheet(root);
  checkRunner(root);
}

describe(MAIN_SUITE, () => {
  const ROOT = process.env.PSTACK_TEST_ROOT ?? process.cwd();

  it("opencode.json apunta al sheet y declara los agentes pstack y sus prompts existen", () => {
    checkConfig(ROOT);
  });

  it("el sheet mapea roles a agentes nombrados sin auto ni inherit-parent", () => {
    checkSheet(ROOT);
  });

  it("el runner pstack-run.sh existe", () => {
    checkRunner(ROOT);
  });
});

describe("Pstack fixtures rotas (PS-S3)", () => {
  function rewriteConfig(dir: string, mutate: (cfg: MutableConfig) => void): void {
    const path = join(dir, "opencode.json");
    const cfg = JSON.parse(readFileSync(path, "utf8")) as MutableConfig;
    mutate(cfg);
    writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
  }

  function rewriteSheet(dir: string, from: string, to: string): void {
    const path = join(dir, SHEET_POINTER);
    writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
  }

  function makeFixture(mutate: (dir: string) => void): string {
    const dir = mkdtempSync(join(tmpdir(), "pstack-fx-"));
    const source = process.cwd();
    mkdirSync(join(dir, ".opencode"), { recursive: true });
    copyFileSync(join(source, "opencode.json"), join(dir, "opencode.json"));
    copyFileSync(join(source, SHEET_POINTER), join(dir, SHEET_POINTER));
    copyFileSync(join(source, RUNNER), join(dir, RUNNER));
    mutate(dir);
    return dir;
  }

  it("falla sin puntero al sheet en instructions", () => {
    const dir = makeFixture((d) =>
      rewriteConfig(d, (cfg) => {
        cfg.instructions = cfg.instructions.filter((p) => p !== SHEET_POINTER);
      })
    );
    expect(() => checkPstackWiring(dir)).toThrow();
  });

  it("falla con rol mapeado a inherit-parent", () => {
    const dir = makeFixture((d) =>
      rewriteSheet(d, "bug-fix: pstack-worker", "bug-fix: inherit-parent")
    );
    expect(() => checkPstackWiring(dir)).toThrow();
  });

  it("falla con rol mapeado a auto", () => {
    const dir = makeFixture((d) => rewriteSheet(d, "bug-fix: pstack-worker", "bug-fix: auto"));
    expect(() => checkPstackWiring(dir)).toThrow();
  });

  it("falla sin el agente pstack-judge", () => {
    const dir = makeFixture((d) =>
      rewriteConfig(d, (cfg) => {
        delete cfg.agent["pstack-judge"];
      })
    );
    expect(() => checkPstackWiring(dir)).toThrow();
  });

  it("falla si un agente apunta a un prompt que no existe", () => {
    const dir = makeFixture((d) =>
      rewriteConfig(d, (cfg) => {
        cfg.agent["pstack-worker"] = { ...cfg.agent["pstack-worker"], prompt: "{file:./.opencode/no-existe.prompt.md}" };
      })
    );
    expect(() => checkPstackWiring(dir)).toThrow(/no-existe/);
  });

  it("acepta un agente con prompt existente", () => {
    const dir = makeFixture((d) => {
      writeFileSync(join(d, ".opencode/existe.prompt.md"), "ok\n");
      rewriteConfig(d, (cfg) => {
        cfg.agent["pstack-worker"] = { ...cfg.agent["pstack-worker"], prompt: "{file:./.opencode/existe.prompt.md}" };
      });
    });
    expect(() => checkPstackWiring(dir)).not.toThrow();
  });

  it("falla si vuelve un agente quitado (ADR-0113)", () => {
    const dir = makeFixture((d) =>
      rewriteConfig(d, (cfg) => {
        cfg.agent["poteto-agent"] = { mode: "subagent", model: "opencode/deepseek-v4.1-flash-free" };
      })
    );
    expect(() => checkPstackWiring(dir)).toThrow();
  });

  (process.env.PSTACK_FIXTURE_CHILD === "1" ? it.skip : it)(
    "el test en proceso hijo sale distinto de cero contra fixture rota",
    () => {
      const dir = makeFixture((d) =>
        rewriteConfig(d, (cfg) => {
          cfg.instructions = cfg.instructions.filter((p) => p !== SHEET_POINTER);
        })
      );
      let code = 0;
      let output = "";
      try {
        output = execFileSync(
          "npx",
          ["vitest", "run", "tests/pstack-wiring.test.ts", "-t", MAIN_FILTER],
          {
            cwd: process.cwd(),
            env: { ...process.env, PSTACK_TEST_ROOT: dir, PSTACK_FIXTURE_CHILD: "1" },
            stdio: "pipe",
            timeout: 30000,
          }
        ).toString();
      } catch (err: unknown) {
        const e = err as { status?: unknown; code?: unknown; stdout?: unknown };
        if (e.code === "ETIMEDOUT") throw err;
        code = typeof e.status === "number" ? e.status : 1;
        output = e.stdout instanceof Buffer ? e.stdout.toString() : "";
      }
      expect(code).not.toBe(0);
      expect(output).toContain("failed");
    }
  );
});
