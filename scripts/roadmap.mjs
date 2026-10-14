import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aplicarSeccion, guardaPR, parsearAvance, renderizarSeccion } from "./roadmap-lib.mjs";

const INICIO = "<!-- roadmap:avances:inicio -->";

function leerAvances(root) {
  const dir = join(root, "docs", "roadmap", "avances");
  let entradas = [];
  try {
    entradas = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  return entradas.map((f) => parsearAvance(readFileSync(join(dir, f), "utf8"), f));
}

const args = process.argv.slice(2);
let root = process.cwd();
let check = false;
let validate = false;
let guard = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") check = true;
  else if (args[i] === "--validate") validate = true;
  else if (args[i] === "--root") root = args[++i];
  else if (args[i] === "--guard") guard = args[++i];
}

if (guard !== null) {
  const archivos = readFileSync(guard, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const r = guardaPR(archivos);
  if (!r.ok) {
    console.error(r.motivo);
    process.exit(1);
  }
  console.log("guardaPR: ok");
  process.exit(0);
}

let avances;
try {
  avances = leerAvances(root);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

if (validate) {
  console.log(`avances válidos: ${avances.length}`);
  process.exit(0);
}

const rutaRoadmap = join(root, "docs", "ROADMAP.md");
const roadmap = readFileSync(rutaRoadmap, "utf8");
const nuevo = aplicarSeccion(roadmap, renderizarSeccion(avances));

if (check) {
  if (!roadmap.includes(INICIO)) {
    console.log("sin marcadores todavía");
    process.exit(0);
  }
  if (nuevo !== roadmap) {
    console.error("la sección de avances está desactualizada: corré npm run roadmap en main");
    process.exit(1);
  }
  console.log("sección de avances al día");
  process.exit(0);
}

if (nuevo !== roadmap) {
  writeFileSync(rutaRoadmap, nuevo);
  console.log("docs/ROADMAP.md actualizado");
} else {
  console.log("docs/ROADMAP.md sin cambios");
}
