// P10-25: regenera bloques de política de comentarios en AGENTS.md y delete-comment.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bloqueAgentsMarkdown, bloqueSkillReglasMarkdown } from "./comentarios-politica.mjs";

const INICIO_AGENTS = "<!-- comentarios-politica:inicio -->";
const FIN_AGENTS = "<!-- comentarios-politica:fin -->";
const INICIO_SKILL = "<!-- comentarios-politica-reglas:inicio -->";
const FIN_SKILL = "<!-- comentarios-politica-reglas:fin -->";

const args = process.argv.slice(2);
const check = args.includes("--check");
const raiz = process.cwd();

function aplicarMarcadores(texto, inicio, fin, contenido) {
  if (!texto.includes(inicio) || !texto.includes(fin)) {
    throw new Error(`faltan marcadores ${inicio} / ${fin}`);
  }
  const re = new RegExp(`${inicio}[\\s\\S]*?${fin}`, "m");
  return texto.replace(re, `${inicio}\n${contenido}\n${fin}`);
}

function generar() {
  const agentsPath = join(raiz, "AGENTS.md");
  const skillPath = join(raiz, ".agents/skills/delete-comment/SKILL.md");

  const agentsNuevo = aplicarMarcadores(readFileSync(agentsPath, "utf8"), INICIO_AGENTS, FIN_AGENTS, bloqueAgentsMarkdown());
  const skillNuevo = aplicarMarcadores(readFileSync(skillPath, "utf8"), INICIO_SKILL, FIN_SKILL, bloqueSkillReglasMarkdown());

  return { agentsPath, skillPath, agentsNuevo, skillNuevo };
}

// El bloque generado sale solo de comentarios-politica.mjs (determinista): corre en
// cualquier rama porque verify no tiene CI y nadie lo regeneraría en main por nosotros.
if (check) {
  try {
    const { agentsPath, skillPath, agentsNuevo, skillNuevo } = generar();
    const agentsViejo = readFileSync(agentsPath, "utf8");
    const skillViejo = readFileSync(skillPath, "utf8");
    if (agentsViejo !== agentsNuevo || skillViejo !== skillNuevo) {
      console.error("bloque de comentarios desactualizado: corré npm run docs:comentarios");
      process.exit(1);
    }
    console.log("docs:comentarios al día");
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

const { agentsPath, skillPath, agentsNuevo, skillNuevo } = generar();
writeFileSync(agentsPath, agentsNuevo);
writeFileSync(skillPath, skillNuevo);
console.log("AGENTS.md y delete-comment/SKILL.md actualizados (comentarios-politica)");