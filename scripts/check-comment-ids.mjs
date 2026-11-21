// RETRO-01: chequea comentarios `//` nuevos en src/ (ADR-0064, PLAN-COM-01-E).
// Regla mecánica de AGENTS.md: solo líneas agregadas desde la base del PR.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function gitOk(...args) {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function commitExiste(ref) {
  return gitOk("cat-file", "-e", `${ref}^{commit}`);
}

function enAlcance(archivo) {
  return archivo.startsWith("src/");
}

const explicito = process.argv.slice(2).find((a) => !a.startsWith("-"));
const envBase = String(process.env.COMMENT_CHECK_BASE ?? "").trim();
let baseFijada = "";
try {
  baseFijada = String(JSON.parse(readFileSync("scripts/comment-rule-base.json", "utf8")).base ?? "").trim();
} catch {
  baseFijada = "";
}

let base =
  explicito ||
  envBase ||
  baseFijada ||
  git("merge-base", "HEAD", "origin/main").trim() ||
  git("merge-base", "HEAD", "main").trim();

if (!base) {
  console.error(
    "check-comment-ids: no se pudo resolver la base (probá fetch de origin/main o pasá un SHA con argumento).",
  );
  process.exit(1);
}

if (!commitExiste(base)) {
  console.error(`check-comment-ids: la base no existe en este repo: ${base}`);
  process.exit(1);
}

const ID = /\b[A-Z][A-Z0-9]*[-\w]*\d[\w-]*\b/;
const CLASE = /\[(plataforma|fiscal|tenant)\]/;
const MARCADOR = /\b(TODO|FIXME|HACK|XXX|temporal|por ahora)\b/i;
const ENLACE_ISSUE = /#\d+\b/;
const SOLO_SEPARADOR = /^\s*\/\/[-\s=*:]*$/;

function agregadosDe(diff) {
  const out = [];
  let archivo = "";
  for (const linea of diff.split("\n")) {
    if (linea.startsWith("+++ b/")) {
      archivo = linea.slice(6);
      continue;
    }
    if (linea.startsWith("+") && !linea.startsWith("+++") && archivo && enAlcance(archivo)) {
      out.push({ archivo, texto: linea.slice(1) });
    }
  }
  return out;
}

const lineas = [
  ...agregadosDe(git("diff", "--unified=0", `${base}...HEAD`)),
  ...agregadosDe(git("diff", "--unified=0", "HEAD")),
];

for (const archivo of git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)) {
  if (!enAlcance(archivo) || archivo.endsWith(".md")) continue;
  for (const texto of readFileSync(archivo, "utf8").split("\n")) {
    lineas.push({ archivo, texto });
  }
}

const bloques = [];
let actual = null;
for (const { archivo, texto } of lineas) {
  if (/^\s*\/\//.test(texto) && !SOLO_SEPARADOR.test(texto)) {
    if (actual && actual.archivo === archivo) {
      actual.lineas.push(texto);
    } else {
      actual = { archivo, lineas: [texto] };
      bloques.push(actual);
    }
  } else {
    actual = null;
  }
}

const problemas = [];
for (const b of bloques) {
  if (!b.lineas.some((l) => ID.test(l))) {
    problemas.push({ tipo: "sin-id", archivo: b.archivo, vista: b.lineas[0].trim() });
  } else if (!b.lineas.some((l) => CLASE.test(l))) {
    problemas.push({ tipo: "sin-clase", archivo: b.archivo, vista: b.lineas[0].trim() });
  }
  for (const l of b.lineas) {
    if (MARCADOR.test(l) && !ENLACE_ISSUE.test(l)) {
      problemas.push({ tipo: "com-s7", archivo: b.archivo, vista: l.trim() });
    }
  }
}

if (problemas.length) {
  console.error(`check-comment-ids: ${problemas.length} problema(s) (base ${base}, alcance src/):`);
  for (const p of problemas) {
    if (p.tipo === "sin-id") {
      console.error(`  sin id de ítem: ${p.archivo}: ${p.vista}`);
    } else if (p.tipo === "sin-clase") {
      console.error(`  sin clase ADR-0064: ${p.archivo}: ${p.vista}`);
    } else {
      console.error(`  marcador temporal sin issue (COM-S7): ${p.archivo}: ${p.vista}`);
    }
  }
  console.error("");
  console.error("Preferí BORRAR el comentario si solo repite el código o narra historia.");
  console.error(
    "Si aporta un porqué real, una línea con id y clase; p.ej.",
    "// TB-165 [tenant]: el rol sale de la membership, nunca del body",
  );
  console.error("Clases: [plataforma] [fiscal] [tenant]");
  console.error("Política: docs/adr/0064-politica-comentarios.md · Procedimiento: .agents/skills/delete-comment/SKILL.md");
  console.error("COM-S7: TODO/FIXME/HACK/XXX/temporal/'por ahora' requieren #<issue> en la misma línea");
  process.exit(1);
}

console.log(`check-comment-ids ok (base ${base}, alcance src/)`);