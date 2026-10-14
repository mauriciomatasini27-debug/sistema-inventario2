import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ratchet } from "./ratchets.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const BASELINES = JSON.parse(readFileSync(join(AQUI, "baselines.json"), "utf8")) as {
  asNeverTestsTotal: number;
  asNeverHandlerRequest: number;
  storeRepos: number;
  comentariosNoExiste: number;
  esModoMulti: number;
};

const IGNORAR = new Set(["node_modules", "dist", ".git"]);

function caminar(dir: string, extensiones: readonly string[]): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir).sort()) {
    if (IGNORAR.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...caminar(p, extensiones));
    else if (extensiones.some((x) => p.endsWith(x)) && !p.endsWith(".astro")) out.push(p);
  }
  return out;
}

function rel(p: string): string {
  return relative(RAIZ, p);
}

function contar(patron: RegExp, archivos: string[]): { total: number; hits: string[] } {
  const hits: string[] = [];
  let total = 0;
  for (const f of archivos) {
    const lineas = readFileSync(f, "utf8").split("\n");
    lineas.forEach((linea, i) => {
      const n = (linea.match(patron) ?? []).length;
      for (let k = 0; k < n; k++) hits.push(`${rel(f)}:${i + 1}`);
      total += n;
    });
  }
  return { total, hits };
}

const AS_NEVER = /\bas never\b/g;

function archivosTests(): string[] {
  return caminar(join(RAIZ, "tests"), [".ts"]).filter((f) => !rel(f).startsWith("tests/arch"));
}

describe("ARQ-S6 trinquetes de arquitectura (solo bajan)", () => {
  it("AT2 total: `as never` en tests/ (fuera de tests/arch) solo baja", () => {
    const { total, hits } = contar(AS_NEVER, archivosTests());
    expect(() => ratchet("asNeverTestsTotal", total, BASELINES.asNeverTestsTotal, hits)).not.toThrow();
  });

  it("AT2 handler: `as never` en líneas con request en tests que importan un handler de src/pages/api solo baja", () => {
    const hits: string[] = [];
    let total = 0;
    for (const f of archivosTests()) {
      const texto = readFileSync(f, "utf8");
      if (!texto.includes("pages/api")) continue;
      texto.split("\n").forEach((linea, i) => {
        if (/\bas never\b/.test(linea) && linea.toLowerCase().includes("request")) {
          const n = (linea.match(AS_NEVER) ?? []).length;
          for (let k = 0; k < n; k++) hits.push(`${rel(f)}:${i + 1}`);
          total += n;
        }
      });
    }
    expect(() => ratchet("asNeverHandlerRequest", total, BASELINES.asNeverHandlerRequest, hits)).not.toThrow();
  });

  it("AT4: referencias `store.` en src/lib/repos solo bajan", () => {
    const { total, hits } = contar(/\bstore\./g, caminar(join(RAIZ, "src", "lib", "repos"), [".ts"]));
    expect(() => ratchet("storeRepos", total, BASELINES.storeRepos, hits)).not.toThrow();
  });

  it("AT5: comentarios que afirman algo no existe en src solo bajan", () => {
    const patron = /no existe|no hay tabla|sin tabla|todavía no hay|todavia no hay/i;
    const hits: string[] = [];
    let total = 0;
    for (const f of caminar(join(RAIZ, "src"), [".ts", ".tsx"])) {
      readFileSync(f, "utf8").split("\n").forEach((linea, i) => {
        if ((linea.includes("//") || linea.includes("/*")) && patron.test(linea)) {
          hits.push(`${rel(f)}:${i + 1}: ${linea.trim().slice(0, 140)}`);
          total += 1;
        }
      });
    }
    expect(() => ratchet("comentariosNoExiste", total, BASELINES.comentariosNoExiste, hits)).not.toThrow();
  });

  it("ARQ-S4: ocurrencias de `esModoMulti` en src solo bajan", () => {
    const { total, hits } = contar(/esModoMulti/g, caminar(join(RAIZ, "src"), [".ts", ".tsx"]));
    expect(() => ratchet("esModoMulti", total, BASELINES.esModoMulti, hits)).not.toThrow();
  });
});
