import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { armarEstado, evaluarNumeros } from "./numeros-lib.mjs";

const args = process.argv.slice(2);
let basePedida = null;
let head = "HEAD";
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--base") basePedida = args[(i += 1)] ?? null;
  else if (a.startsWith("--base=")) basePedida = a.slice("--base=".length) || null;
  else if (a === "--head") head = args[(i += 1)] ?? "HEAD";
  else if (a.startsWith("--head=")) head = a.slice("--head=".length) || "HEAD";
}

function git(partes) {
  try {
    return execFileSync("git", partes, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function refExiste(ref) {
  return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== null;
}

function resolverBase() {
  if (basePedida) return refExiste(basePedida) ? basePedida : null;
  if (refExiste("origin/main")) return "origin/main";
  if (refExiste("main")) return "main";
  return null;
}

function estadoDeRef(ref) {
  const crudo = git(["ls-tree", "-r", "--name-only", ref, "--", "drizzle", "docs/adr", "docs/roadmap/avances"]);
  if (crudo === null) throw new Error(`no pude listar el árbol de ${ref}`);
  const journalCrudo = git(["show", `${ref}:drizzle/meta/_journal.json`]);
  if (journalCrudo === null) throw new Error(`no pude leer drizzle/meta/_journal.json de ${ref}`);
  const journal = JSON.parse(journalCrudo).entries ?? [];
  return armarEstado({ archivos: crudo.split("\n").filter(Boolean), journal });
}

function estadoDeDisco() {
  const archivos = [];
  for (const dir of ["drizzle", "docs/adr", "docs/roadmap/avances"]) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile()) archivos.push(`${dir}/${e.name}`);
    }
  }
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries ?? [];
  return armarEstado({ archivos, journal });
}

const base = resolverBase();
if (base === null) {
  console.warn(
    "check:numeros: sin origin/main ni main; se saltea la guarda de números (degradado, no falla).",
  );
  process.exit(0);
}

const usarDisco = head === "HEAD";
if (!usarDisco && !refExiste(head)) {
  console.error(`check:numeros: no existe el ref ${head}`);
  process.exit(2);
}

let estadoBase;
let estadoRama;
try {
  estadoBase = estadoDeRef(base);
  estadoRama = usarDisco ? estadoDeDisco() : estadoDeRef(head);
} catch (e) {
  console.error(`check:numeros: ${e.message}`);
  process.exit(2);
}

const resultado = evaluarNumeros({ base: estadoBase, rama: estadoRama });
if (resultado.ok) {
  console.log(`check:numeros ok contra ${base}`);
  process.exit(0);
}

console.error("check:numeros: la rama reusa números que main ya reservó.");
for (const p of resultado.problemas) console.error(p);
if (resultado.arreglos.length > 0) {
  console.error("Arreglo concreto (renumerá en cascada y actualizá las referencias):");
  for (const a of resultado.arreglos) console.error(a);
}
console.error(`Base: ${base}. Volvé a correr npm run check:numeros después de renumerar.`);
process.exit(1);
