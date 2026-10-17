import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsearAvances, parsearMigraciones, renderEstado } from "./docs-estado-lib.mjs";

const args = process.argv.slice(2);
let raiz = "docs";
let check = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--check") check = true;
  else if (args[i] === "--raiz") raiz = args[(i += 1)] ?? raiz;
  else if (args[i].startsWith("--raiz=")) raiz = args[i].slice("--raiz=".length) || raiz;
}

function leerAvances(base) {
  const dir = join(base, "roadmap", "avances");
  let entradas = [];
  try {
    entradas = readdirSync(dir)
      .filter((f) => f.endsWith(".md") && f !== "README.md")
      .sort();
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  return entradas.map((nombre) => ({ nombre, texto: readFileSync(join(dir, nombre), "utf8") }));
}

function leerTexto(ruta) {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    return "";
  }
}

function leerBloqueos(base) {
  try {
    const parsed = JSON.parse(readFileSync(join(base, "roadmap", "bloqueos.json"), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const contenido = renderEstado({
  avances: parsearAvances(leerAvances(raiz)),
  migraciones: parsearMigraciones(leerTexto(join(raiz, "roadmap", "migraciones-aplicadas.md"))),
  bloqueos: leerBloqueos(raiz),
});

const rutaEstado = join(raiz, "ESTADO.md");
if (check) {
  const viejo = existsSync(rutaEstado) ? readFileSync(rutaEstado, "utf8") : null;
  if (viejo !== contenido) {
    console.error(`${rutaEstado} desactualizado: corré npm run docs:estado`);
    process.exit(1);
  }
  console.log("docs:estado al día");
} else {
  writeFileSync(rutaEstado, contenido);
  console.log(`${rutaEstado} actualizado`);
}
