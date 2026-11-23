import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILLS = join(process.cwd(), ".agents", "skills");
const lock = JSON.parse(readFileSync("skills-lock.json", "utf8"));
const manifiesto = JSON.parse(readFileSync("skills-manifest.json", "utf8"));

const remotas: string[] = Object.entries(lock.skills as Record<string, { commit?: string; sourceType?: string }>)
  .filter(([, v]) => v.commit && v.sourceType === "github")
  .map(([nombre]) => nombre)
  .sort();

const archivosEnDisco = (skill: string): string[] => {
  const dir = join(SKILLS, skill);
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => statSync(join(dir, f)).isFile())
    .map((f) => f.split("\\").join("/"))
    .sort();
};

describe("skills instaladas completas (skills-manifest.json)", () => {
  it("el manifiesto cubre exactamente las skills remotas del lock", () => {
    expect(Object.keys(manifiesto.skills).sort()).toEqual(remotas);
  });

  it("cada skill tiene exactamente los archivos del commit pinneado", () => {
    for (const skill of remotas) {
      const esperados: string[] = manifiesto.skills[skill];
      expect(esperados?.length, `${skill} sin lista en el manifiesto`).toBeGreaterThan(0);
      expect(archivosEnDisco(skill), skill).toEqual([...esperados].sort());
    }
  });

  it("todo enlace relativo de una skill resuelve a un archivo que existe", () => {
    const rotos: string[] = [];
    for (const skill of remotas) {
      const dir = join(SKILLS, skill);
      const markdown = archivosEnDisco(skill).filter((f) => f.endsWith(".md"));
      for (const archivo of markdown) {
        const texto = readFileSync(join(dir, archivo), "utf8");
        for (const m of texto.matchAll(/\]\(([^)#:]+)\)/g)) {
          const destino = m[1];
          if (!destino || /^(https?|\/\/|\/|#)/.test(destino)) continue;
          if (!existsSync(resolve(dir, destino))) rotos.push(`${relative(SKILLS, join(dir, archivo))} -> ${destino}`);
        }
      }
    }
    expect(rotos).toEqual([]);
  });

  it("toda skill del manifiesto conserva su SKILL.md", () => {
    const sinSkillMd = Object.entries(manifiesto.skills as Record<string, string[]>)
      .filter(([, archivos]) => !archivos.includes("SKILL.md"))
      .map(([skill]) => skill);
    expect(sinSkillMd).toEqual([]);
  });
});
