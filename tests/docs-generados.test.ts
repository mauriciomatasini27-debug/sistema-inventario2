import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARCHIVOS_GENERADOS, evaluarGuard, generadosEn, normalizarRuta } from "../scripts/docs-generados-lib.mjs";
import { esRamaDeTrabajo, esRamaPrincipal } from "../scripts/rama-lib.mjs";

const CLI = fileURLToPath(new URL("../scripts/docs-generados.mjs", import.meta.url));
const ESTADO_CLI = fileURLToPath(new URL("../scripts/docs-estado.mjs", import.meta.url));

const ENV_GIT = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };

describe("docs:generados lib", () => {
  it("normaliza separadores y prefijo ./", () => {
    expect(normalizarRuta(".\\docs\\ESTADO.md")).toBe("docs/ESTADO.md");
    expect(normalizarRuta("./docs/ROADMAP.md")).toBe("docs/ROADMAP.md");
  });

  it("lista solo los generados presentes", () => {
    expect(generadosEn(["docs/ESTADO.md", "src/x.ts", "docs/INDEX.md"])).toEqual([
      "docs/ESTADO.md",
      "docs/INDEX.md",
    ]);
    expect(ARCHIVOS_GENERADOS).toContain("docs/graph.json");
    expect(ARCHIVOS_GENERADOS).toContain("docs/roadmap/migraciones-aplicadas.md");
  });

  it("pasa en la rama principal aunque toque generados", () => {
    const r = evaluarGuard({ archivos: ["docs/ROADMAP.md"], principal: true });
    expect(r.ok).toBe(true);
  });

  it("pasa si la rama no toca generados", () => {
    const r = evaluarGuard({ archivos: ["docs/roadmap/avances/ROAD1-S5.md", "src/x.ts"], principal: false });
    expect(r.ok).toBe(true);
  });

  it("falla nombrando archivo y arreglo si la rama trae generados", () => {
    const r = evaluarGuard({
      archivos: ["docs/ESTADO.md", "docs/ROADMAP.md", "docs/roadmap/avances/ROAD1-S5.md"],
      principal: false,
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("docs/ESTADO.md");
    expect(r.motivo).toContain("docs/ROADMAP.md");
    expect(r.motivo).toContain("git checkout");
  });

  it("reconoce main y master como rama principal", () => {
    expect(esRamaPrincipal("main")).toBe(true);
    expect(esRamaPrincipal("master")).toBe(true);
    expect(esRamaPrincipal("mauri/desbloqueo")).toBe(false);
    expect(esRamaPrincipal("")).toBe(false);
  });

  it("trata una rama nombrada distinta de main como rama de trabajo", () => {
    expect(esRamaDeTrabajo("mauri/desbloqueo")).toBe(true);
    expect(esRamaDeTrabajo("feat/x")).toBe(true);
    expect(esRamaDeTrabajo("main")).toBe(false);
    expect(esRamaDeTrabajo("HEAD")).toBe(true);
    expect(esRamaDeTrabajo("")).toBe(false);
  });
});

function git(dir: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  });
}

function repoDePrueba() {
  const dir = mkdtempSync(join(tmpdir(), "docs-generados-"));
  const ident = ["-c", "user.email=t@t", "-c", "user.name=t"];
  git(dir, ["init", "-b", "main"]);
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "ESTADO.md"), "# Estado\n\nmain\n");
  git(dir, ["add", "-A"]);
  git(dir, [...ident, "commit", "-m", "main"]);
  return { dir, ident };
}

function guard(dir: string) {
  return spawnSync("node", [CLI, "--base", "main", "--head", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
    env: ENV_GIT,
  });
}

describe("docs:generados guard contra git real", () => {
  it("sale 1 y nombra el arreglo si la rama commitea un generado", () => {
    const { dir, ident } = repoDePrueba();
    git(dir, ["checkout", "-b", "feature-con-generado"]);
    writeFileSync(join(dir, "docs", "ESTADO.md"), "# Estado\n\nrama\n");
    writeFileSync(join(dir, "src.ts"), "export const x = 1;\n");
    git(dir, ["add", "-A"]);
    git(dir, [...ident, "commit", "-m", "feat"]);
    const r = guard(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("docs/ESTADO.md");
    expect(r.stderr).toContain("git checkout");
  });

  it("sale 1 si un generado queda sucio en el working tree", () => {
    const { dir } = repoDePrueba();
    git(dir, ["checkout", "-b", "feature"]);
    const forzado = spawnSync("node", [ESTADO_CLI, "--forzar"], { cwd: dir, encoding: "utf8", env: ENV_GIT });
    expect(forzado.status).toBe(0);
    const r = guard(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("docs/ESTADO.md");
  });

  it("sale 0 si la rama solo agrega un avance y código", () => {
    const { dir, ident } = repoDePrueba();
    git(dir, ["checkout", "-b", "feature-limpia"]);
    mkdirSync(join(dir, "docs", "roadmap", "avances"), { recursive: true });
    writeFileSync(join(dir, "docs", "roadmap", "avances", "ROAD1-S5.md"), "avance\n");
    writeFileSync(join(dir, "src.ts"), "export const y = 2;\n");
    git(dir, ["add", "-A"]);
    git(dir, [...ident, "commit", "-m", "feat"]);
    const r = guard(dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ok");
  });
});

describe("generadores no escriben en rama de trabajo", () => {
  it("docs:estado deja ESTADO.md como está en la rama y escribe con --forzar", () => {
    const { dir } = repoDePrueba();
    git(dir, ["checkout", "-b", "feature"]);
    const antes = readFileSync(join(dir, "docs", "ESTADO.md"), "utf8");

    const sinForzar = spawnSync("node", [ESTADO_CLI], { cwd: dir, encoding: "utf8", env: ENV_GIT });
    expect(sinForzar.status).toBe(0);
    expect(readFileSync(join(dir, "docs", "ESTADO.md"), "utf8")).toBe(antes);

    const forzado = spawnSync("node", [ESTADO_CLI, "--forzar"], { cwd: dir, encoding: "utf8", env: ENV_GIT });
    expect(forzado.status).toBe(0);
    expect(readFileSync(join(dir, "docs", "ESTADO.md"), "utf8")).toContain("# Estado del proyecto");
  });
});
