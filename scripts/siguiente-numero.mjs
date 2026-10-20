import { execFileSync } from "node:child_process";
import { armarEstado, maximo, siguienteNumero } from "./numeros-lib.mjs";

const args = process.argv.slice(2);
let basePedida = null;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--base") basePedida = args[(i += 1)] ?? null;
  else if (a.startsWith("--base=")) basePedida = a.slice("--base=".length) || null;
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

const base = resolverBase();
if (base === null) {
  console.error(
    "siguiente-numero: no encontré origin/main ni main; traé main o pasá --base <ref>.",
  );
  process.exit(2);
}

const crudo = git(["ls-tree", "-r", "--name-only", base, "--", "drizzle", "docs/adr", "docs/roadmap/avances"]);
const journalCrudo = git(["show", `${base}:drizzle/meta/_journal.json`]);
if (crudo === null || journalCrudo === null) {
  console.error(`siguiente-numero: no pude leer el árbol de ${base}`);
  process.exit(2);
}

const journal = JSON.parse(journalCrudo).entries ?? [];
const estado = armarEstado({ archivos: crudo.split("\n").filter(Boolean), journal });
const maxMigracion = Math.max(maximo(estado.migraciones), maximo(estado.journal));
const maxAdr = maximo(estado.adrs);
const maxAvance = maximo(estado.avances);

console.log(`Base: ${base}`);
console.log(`Siguiente migración libre: ${siguienteNumero(maxMigracion)} (idx ${maxMigracion + 1})`);
console.log(`Siguiente ADR libre: ${siguienteNumero(maxAdr)}`);
console.log(`Siguiente avance numerado libre: ${siguienteNumero(maxAvance)}`);
