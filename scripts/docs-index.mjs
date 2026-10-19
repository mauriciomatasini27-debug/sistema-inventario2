import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generarContenidos } from "./docs-index-lib.mjs";
import { esRamaDeTrabajo, ramaActual } from "./rama-lib.mjs";

const args = process.argv.slice(2);
let raiz = "docs";
let check = false;
let forzar = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--check") check = true;
  else if (args[i] === "--forzar") forzar = true;
  else if (args[i] === "--raiz") raiz = args[(i += 1)] ?? raiz;
  else if (args[i].startsWith("--raiz=")) raiz = args[i].slice("--raiz=".length) || raiz;
}

const rutaIndice = join(raiz, "INDEX.md");
const rutaGrafo = join(raiz, "graph.json");
const { index, grafo } = generarContenidos(raiz);

if (check) {
  let viejoIndice = null;
  let viejoGrafo = null;
  try {
    viejoIndice = readFileSync(rutaIndice, "utf8");
  } catch {
    viejoIndice = null;
  }
  try {
    viejoGrafo = readFileSync(rutaGrafo, "utf8");
  } catch {
    viejoGrafo = null;
  }
  const rancios = [];
  if (viejoIndice !== index) rancios.push(rutaIndice);
  if (viejoGrafo !== grafo) rancios.push(rutaGrafo);
  if (rancios.length > 0) {
    console.error(`desactualizado: ${rancios.join(", ")} — corré npm run docs:index`);
    process.exit(1);
  }
  console.log("docs:index al día");
} else if (!forzar && esRamaDeTrabajo(ramaActual())) {
  console.log(`docs:index: en rama de trabajo no se escriben ${rutaIndice} ni ${rutaGrafo}; los regenera main (usá --forzar para previsualizar)`);
} else {
  writeFileSync(rutaIndice, index);
  writeFileSync(rutaGrafo, grafo);
  console.log(`${rutaIndice} y ${rutaGrafo} actualizados`);
}
