import { execFileSync } from "node:child_process";
import { evaluarGuard } from "./docs-generados-lib.mjs";
import { esRamaPrincipal, ramaActual } from "./rama-lib.mjs";

const args = process.argv.slice(2);
let base = null;
let head = "HEAD";
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--base") base = args[(i += 1)] ?? null;
  else if (a.startsWith("--base=")) base = a.slice("--base=".length) || null;
  else if (a === "--head") head = args[(i += 1)] ?? "HEAD";
  else if (a.startsWith("--head=")) head = a.slice("--head=".length) || "HEAD";
}

function git(partes) {
  return execFileSync("git", partes, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

const rama = ramaActual();
if (esRamaPrincipal(rama)) {
  console.log(`docs:generados: rama ${rama || "principal"}, se permite regenerar`);
  process.exit(0);
}

let desde = base;
if (desde === null) {
  try {
    desde = git(["merge-base", "origin/main", head]);
  } catch {
    console.log("docs:generados: sin origin/main, se saltea la guarda");
    process.exit(0);
  }
}

let archivos = [];
try {
  const rango = head === "HEAD" ? [desde] : [`${desde}..${head}`];
  archivos = git(["diff", "--name-only", ...rango]).split("\n").filter((l) => l !== "");
} catch (e) {
  console.error(`docs:generados: no pude diffear ${desde}: ${e.message}`);
  process.exit(2);
}

const r = evaluarGuard({ archivos, principal: false });
if (r.ok) {
  console.log("docs:generados: ok");
  process.exit(0);
}
console.error(r.motivo);
process.exit(1);
