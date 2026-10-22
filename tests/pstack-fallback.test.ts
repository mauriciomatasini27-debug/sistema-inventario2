import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Behavior of .opencode/pstack-run.sh model fallback: a failed attempt that left
// the work tree changed must NOT relaunch another model on top (exit 4).
const FAKE_OC = `#!/usr/bin/env bash
if [ "$1" = "serve" ]; then
  port=""; while [ $# -gt 0 ]; do [ "$1" = "--port" ] && port=$2; shift; done
  exec node -e "require('http').createServer((q,r)=>r.end('ok')).listen($port,'127.0.0.1')"
fi
prompt="\${@: -1}"
[ "$prompt" = "Reply OK" ] && exit 0
model=""; dir=""; while [ $# -gt 0 ]; do case "$1" in -m) model=$2;; --dir) dir=$2;; esac; shift; done
echo "$model" >> "$dir/../intentos.log"
[ -n "$FAKE_TOCA" ] && echo cambio > "$dir/tocado.txt"
echo '{"type":"error","error":"rate limit 429"}'
exit 1
`;

function armar(): { repo: string; oc: string } {
  const base = mkdtempSync(join(tmpdir(), "pstack-fb-"));
  const repo = join(base, "repo");
  mkdirSync(join(repo, ".opencode"), { recursive: true });
  copyFileSync(".opencode/pstack-run.sh", join(repo, ".opencode/pstack-run.sh"));
  copyFileSync(".opencode/modelos.mjs", join(repo, ".opencode/modelos.mjs"));
  copyFileSync(".opencode/modelos-por-skill.json", join(repo, ".opencode/modelos-por-skill.json"));
  writeFileSync(join(repo, ".gitignore"), ".pstack-tmp/\n");
  const oc = join(base, "fake-oc.sh");
  writeFileSync(oc, FAKE_OC);
  chmodSync(oc, 0o755);
  const git = (...a: string[]) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
  return { repo, oc };
}

function correr(
  repo: string,
  oc: string,
  toca: boolean,
  opciones: { ghToken?: string; port?: string } = {},
) {
  const port = opciones.port ?? String(20000 + Math.floor(Math.random() * 20000));
  const r = spawnSync("bash", [join(repo, ".opencode/pstack-run.sh"), "hacé algo", "-m", "fake/a"], {
    cwd: repo,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      GH_TOKEN: opciones.ghToken ?? "",
      OPENCODE_BIN: oc,
      PSTACK_PORT: port,
      PSTACK_SESSION_TIMEOUT: "20",
      PSTACK_FALLBACK_MODELS: "fake/b fake/c",
      PSTACK_MODELOS_CACHE: join(repo, "..", "estado.json"),
      PSTACK_MODELOS_LOG: join(repo, "..", "caidos.log"),
      PSTACK_MODELOS_DISPONIBLES: "fake/a fake/b fake/c",
      FAKE_TOCA: toca ? "1" : "",
    },
  });
  spawnSync("bash", ["-c", `pkill -f "listen\\(${port}" || true`]);
  const intentos = readFileSync(join(repo, "..", "intentos.log"), "utf8").trim().split("\n");
  const cache = existsSync(join(repo, "..", "estado.json"))
    ? JSON.parse(readFileSync(join(repo, "..", "estado.json"), "utf8"))
    : { caidos: {} };
  return { status: r.status, stderr: r.stderr, intentos, caidos: Object.keys(cache.caidos ?? {}) };
}

describe("pstack-run: sin fallback sobre árbol con cambios", () => {
  it("si el intento fallido dejó cambios, corta con exit 4 y no prueba otro modelo", () => {
    const { repo, oc } = armar();
    const r = correr(repo, oc, true);
    expect(r.status).toBe(4);
    expect(r.intentos).toEqual(["fake/a"]);
    expect(r.caidos).toEqual([]);
    expect(r.stderr).toContain("no relanzo");
  }, 90_000);

  it("si el árbol quedó igual, sigue con el próximo modelo y aísla cache y log", () => {
    const { repo, oc } = armar();
    const r = correr(repo, oc, false);
    expect(r.status).toBe(1);
    expect(r.intentos).toEqual(["fake/a", "fake/b", "fake/c"]);
    expect(r.caidos.sort()).toEqual(["fake/a", "fake/b", "fake/c"]);
    expect(existsSync(join(repo, "..", "caidos.log"))).toBe(true);
  }, 90_000);

  it("no mata un proceso ajeno que solo menciona opencode serve en su argv", () => {
    const { repo, oc } = armar();
    const port = String(20000 + Math.floor(Math.random() * 20000));
    const decoy = spawn("bash", ["-c", `exec -a "opencode serve --port ${port}" sleep 60`], { stdio: "ignore" });
    if (!decoy.pid) throw new Error("decoy sin pid");
    const cmdline = `/proc/${decoy.pid}/cmdline`;
    for (let i = 0; i < 40; i++) {
      const actual = existsSync(cmdline) ? readFileSync(cmdline, "utf8").split("\0").join(" ") : "";
      if (actual.includes(`opencode serve --port ${port}`)) break;
      spawnSync("sleep", ["0.05"]);
    }
    try {
      const r = correr(repo, oc, false, { ghToken: "token", port });
      expect(decoy.exitCode).toBeNull();
      expect(r.status).toBe(1);
    } finally {
      decoy.kill("SIGKILL");
    }
  }, 90_000);
});
