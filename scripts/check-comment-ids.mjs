// RETRO-01: chequea que todo comentario `//` agregado en el diff
// nombre el ítem que lo motiva. Regla mecánica de AGENTS.md ("Regla de cada PR"):
// se aplica solo a líneas nuevas, así que el código legacy no bloquea el gate.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

const explicito = process.argv.slice(2).find((a) => !a.startsWith("-"));
let baseFijada = "";
try {
  baseFijada = String(JSON.parse(readFileSync("scripts/comment-rule-base.json", "utf8")).base ?? "");
} catch {
  baseFijada = "";
}
const base =
  explicito ||
  baseFijada ||
  git("merge-base", "HEAD", "origin/main").trim() ||
  git("merge-base", "HEAD", "main").trim() ||
  "HEAD~1";

if (!git("rev-parse", "--verify", base).trim()) {
  console.error(`check-comment-ids: base no válida: ${base}`);
  process.exit(2);
}

const ID = /\b[A-Z][A-Z0-9]*[-\w]*\d[\w-]*\b/;
const CLASE = /\[(plataforma|fiscal|tenant)\]/;
const SOLO_SEPARADOR = /^\s*\/\/[-\s=*:]*$/;

function agregadosDe(diff) {
  const out = [];
  let archivo = "";
  for (const linea of diff.split("\n")) {
    if (linea.startsWith("+++ b/")) {
      archivo = linea.slice(6);
      continue;
    }
    if (linea.startsWith("+") && !linea.startsWith("+++") && archivo) {
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
  if (archivo.endsWith(".md")) continue;
  for (const texto of readFileSync(archivo, "utf8").split("\n")) {
    lineas.push({ archivo, texto });
  }
}

// RETRO-01: un bloque de líneas `//` consecutivas cuenta como un solo comentario:
// basta el id en la primera línea para que todo el bloque quede identificado.
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
    problemas.push(`sin id de ítem: ${b.archivo}: ${b.lineas[0].trim()}`);
  } else if (!b.lineas.some((l) => CLASE.test(l))) {
    problemas.push(`sin clase ADR-0064: ${b.archivo}: ${b.lineas[0].trim()}`);
  }
}

if (problemas.length) {
  console.error(`check-comment-ids: ${problemas.length} bloque(s) inválido(s) (base ${base}):`);
  for (const p of problemas) console.error(`  ${p}`);
  console.error("clases ADR-0064: [plataforma], [fiscal], [tenant]");
  process.exit(1);
}

console.log(`check-comment-ids ok (base ${base})`);
