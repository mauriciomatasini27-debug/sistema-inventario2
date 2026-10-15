import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.PSTACK_TEST_ROOT ?? process.cwd();

describe("Pstack con agentes nombrados (PRD-PS-01, ADR-0085)", () => {
  it("opencode.json apunta al sheet y declara los agentes pstack", () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, "opencode.json"), "utf8")) as {
      instructions?: unknown;
      agent?: Record<string, { mode?: string } | undefined>;
    };
    expect(cfg.instructions).toEqual(
      expect.arrayContaining([".opencode/pstack-models.md"])
    );
    expect(cfg.agent?.["pstack-worker"]?.mode).toBe("subagent");
    expect(cfg.agent?.["pstack-judge"]?.mode).toBe("subagent");
  });

  it("el sheet mapea roles a pstack-worker y pstack-judge sin inherit-parent", () => {
    const sheetPath = join(ROOT, ".opencode/pstack-models.md");
    expect(existsSync(sheetPath)).toBe(true);
    const sheet = readFileSync(sheetPath, "utf8");
    expect(sheet).toContain("feature, refactoring: pstack-worker");
    expect(sheet).toContain("judgment and prose: pstack-judge");
    expect(sheet).toContain("arena runners: pstack-worker, pstack-judge");
    expect(sheet).toContain("poteto-mode routing target: poteto-agent");
    expect(sheet).toContain("no-comments reviewer: comment-sicko");
    expect(sheet).not.toMatch(/:\s*inherit-parent/);
  });
});
