import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { aplicarFrontmatter, extraerResumen, inferirFrontmatter, listarDocs, parseFrontmatter } from "./docs-lib.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const soloResumen = args.includes("--resumen");
const objetivos = args.filter((a) => a !== "--write" && a !== "--dry-run" && a !== "--resumen");
if (objetivos.length === 0) objetivos.push("docs");

// rutas absolutas de los md a procesar
function juntar(objetivo) {
  let st;
  try {
    st = statSync(objetivo);
  } catch {
    console.error(`ERROR ${objetivo}: no existe`);
    process.exitCode = 1;
    return [];
  }
  if (st.isDirectory()) return listarDocs(objetivo).map((p) => join(objetivo, p));
  if (objetivo.endsWith(".md")) return [objetivo];
  return [];
}

const archivos = [...new Set(objetivos.flatMap(juntar))].sort();
let cambiados = 0;
for (const archivo of archivos) {
  const ruta = relative(process.cwd(), archivo) || archivo;
  const texto = readFileSync(archivo, "utf8");
  const inferidos = inferirFrontmatter(ruta.replace(/\\/g, "/"), texto);
  if (soloResumen) inferidos.resumen = extraerResumen(texto);
  const nuevo = aplicarFrontmatter(texto, inferidos);
  const cuerpoViejo = parseFrontmatter(texto).cuerpo;
  if (parseFrontmatter(nuevo).cuerpo !== cuerpoViejo) {
    console.error(`ERROR ${ruta}: el cuerpo cambió, se omite`);
    process.exitCode = 1;
    continue;
  }
  if (nuevo !== texto) {
    cambiados += 1;
    if (write) writeFileSync(archivo, nuevo);
  }
  const mods = `[${inferidos.modulos.join(", ")}]`;
  console.log(`${ruta}\t${inferidos.id}\t${inferidos.tipo}\t${inferidos.estado}\t${mods}`);
}
console.log(`total: ${archivos.length} archivo(s), con cambios: ${cambiados}${write ? "" : " (dry-run)"}`);
