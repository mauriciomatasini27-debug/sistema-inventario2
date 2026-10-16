import { existsSync, readFileSync } from "node:fs";
import { basename, join, normalize } from "node:path";
import { generarContenidos } from "./docs-index-lib.mjs";
import { listarDocs } from "./docs-lib.mjs";
import { aplicarBaseline, checkEnlaces, checkEsquema, checkIds, formatoError } from "./docs-check-lib.mjs";

const args = process.argv.slice(2);
let raiz = "docs";
let rutaBaseline = join("scripts", "docs-check-baseline.json");
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--raiz") raiz = args[(i += 1)] ?? raiz;
  else if (a.startsWith("--raiz=")) raiz = a.slice("--raiz=".length) || raiz;
  else if (a === "--baseline") rutaBaseline = args[(i += 1)] ?? rutaBaseline;
  else if (a.startsWith("--baseline=")) rutaBaseline = a.slice("--baseline=".length) || rutaBaseline;
}

const base = basename(normalize(raiz)) || "docs";
const rels = listarDocs(raiz).filter((r) => !r.split("/").includes("archivo"));
const archivos = rels.map((rel) => ({
  ruta: `${base}/${rel.replace(/\\/g, "/")}`,
  texto: readFileSync(join(raiz, rel), "utf8"),
}));
const existentes = new Set(archivos.map((a) => a.ruta));

const errores = [];
errores.push(...checkEsquema(archivos));
errores.push(...checkIds(archivos));

let baseline = [];
try {
  const crudo = readFileSync(rutaBaseline, "utf8");
  const parsed = JSON.parse(crudo);
  baseline = Array.isArray(parsed) ? parsed : [];
} catch (e) {
  if (existsSync(rutaBaseline)) {
    console.error(formatoError({ ruta: rutaBaseline, linea: 1, mensaje: `baseline ilegible: ${e.message}` }));
    process.exit(1);
  }
}
const rotos = checkEnlaces(archivos, existentes);
const { nuevos, obsoletas } = aplicarBaseline(rotos, baseline);
for (const r of nuevos) errores.push(r);
for (const k of obsoletas) {
  errores.push({ ruta: rutaBaseline, linea: 1, mensaje: `baseline obsoleta, quitar: ${k}` });
}

const { index, grafo } = generarContenidos(raiz);
const leido = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
const rutaIndice = join(raiz, "INDEX.md");
const rutaGrafo = join(raiz, "graph.json");
if (leido(rutaIndice) !== index) {
  errores.push({ ruta: `${base}/INDEX.md`, linea: 1, mensaje: "INDEX desactualizado: corré npm run docs:index" });
}
if (leido(rutaGrafo) !== grafo) {
  errores.push({ ruta: `${base}/graph.json`, linea: 1, mensaje: "graph desactualizado: corré npm run docs:index" });
}

if (errores.length > 0) {
  errores.sort((x, y) => (x.ruta < y.ruta ? -1 : x.ruta > y.ruta ? 1 : x.linea - y.linea));
  for (const e of errores) console.error(formatoError(e));
  console.error(`docs:check falló con ${errores.length} error(es) en ${archivos.length} doc(s)`);
  process.exit(1);
}
console.log(`docs:check ok: ${archivos.length} doc(s), ${rotos.length} enlace(s) roto(s), baseline ${baseline.length}`);
