#!/usr/bin/env node
// AUD-S3/ADR-0126: `npm run check:columnas` valida que cada tabla y columna que el SQL
// crudo de `src/` referencia exista en `src/db/schema*.ts`. No toca ninguna base.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fusionarEstados, parsearEsquemaTS } from "./audit-db-lib.mjs";
import { analizarFuente, formatearHallazgo } from "./check-columnas-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const usarJson = args.includes("--json");

function archivosEsquema() {
  const dir = resolve(root, "src/db");
  return readdirSync(dir)
    .filter((n) => /^schema.*\.ts$/.test(n))
    .sort()
    .map((nombre) => ({ nombre, fuente: readFileSync(resolve(dir, nombre), "utf8") }));
}

function archivosFuente() {
  const salida = [];
  const recorrer = (dir) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(ruta);
        continue;
      }
      if (!entrada.name.endsWith(".ts")) continue;
      if (/^schema.*\.ts$/.test(entrada.name) && dir === resolve(root, "src/db")) continue;
      salida.push(ruta);
    }
  };
  recorrer(resolve(root, "src"));
  return salida.sort();
}

function main() {
  const estado = { tablas: {}, fks: [], exportaciones: new Map() };
  for (const archivo of archivosEsquema()) {
    const parseado = parsearEsquemaTS(archivo.fuente);
    fusionarEstados(estado, parseado);
    for (const [variable, detalle] of parseado.exportaciones ?? []) estado.exportaciones.set(variable, detalle);
  }

  const archivos = archivosFuente();
  const hallazgos = [];
  for (const ruta of archivos) {
    const fuente = readFileSync(ruta, "utf8");
    const relativo = ruta.slice(root.length + 1).replace(/\\/g, "/");
    hallazgos.push(...analizarFuente(relativo, fuente, estado, estado.exportaciones));
  }

  const tablasEsquema = Object.keys(estado.tablas).length;
  if (usarJson) {
    console.log(JSON.stringify({ archivos: archivos.length, tablasEsquema, hallazgos }, null, 2));
  } else {
    console.log(`check:columnas ${archivos.length} archivos de src/ contra ${tablasEsquema} tablas de src/db/schema*.ts`);
    for (const hallazgo of hallazgos) console.log(`- ${formatearHallazgo(hallazgo)}`);
    console.log(
      hallazgos.length === 0
        ? "ok: toda tabla y columna referenciada existe en el schema"
        : `FAIL: ${hallazgos.length} referencia(s) a tablas o columnas inexistentes`,
    );
  }
  process.exitCode = hallazgos.length === 0 ? 0 : 1;
}

main();
