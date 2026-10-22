import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderMigraciones, validarRegistros } from "./docs-migraciones-lib.mjs";
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

const dir = join(raiz, "roadmap", "migraciones");
let nombres;
try {
  nombres = readdirSync(dir).sort();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  console.error(`docs:migraciones: falta ${dir}`);
  process.exit(1);
}

const archivos = nombres.map((nombre) => ({ nombre, texto: readFileSync(join(dir, nombre), "utf8") }));
const { registros, errores } = validarRegistros(archivos);
if (errores.length > 0) {
  for (const e of errores) console.error(`${dir}/${e.nombre}: ${e.mensaje}`);
  console.error(`docs:migraciones falló con ${errores.length} error(es)`);
  process.exit(1);
}

const contenido = renderMigraciones(registros);
const ruta = join(raiz, "roadmap", "migraciones-aplicadas.md");
if (check) {
  const viejo = existsSync(ruta) ? readFileSync(ruta, "utf8") : null;
  if (viejo !== contenido) {
    console.error(`${ruta} desactualizado: corré npm run docs:migraciones`);
    process.exit(1);
  }
  console.log("docs:migraciones al día");
} else if (!forzar && esRamaDeTrabajo(ramaActual())) {
  console.log(`docs:migraciones: en rama de trabajo no se escribe ${ruta}; lo regenera main (usá --forzar para previsualizar)`);
} else {
  writeFileSync(ruta, contenido);
  console.log(`${ruta} actualizado (${registros.length} migraciones)`);
}
