import { buscarContexto, cargarCandidatos, formatearTexto } from "./docs-context-lib.mjs";

const args = process.argv.slice(2);
let json = false;
let raiz = "docs";
const resto = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--json") json = true;
  else if (a === "--raiz") raiz = args[(i += 1)] ?? raiz;
  else if (a.startsWith("--raiz=")) raiz = a.slice("--raiz=".length) || raiz;
  else if (a === "--help" || a === "-h") {
    console.log("Uso: node scripts/docs-context.mjs [--json] [--raiz <dir>] <tema|modulo|id>");
    process.exit(0);
  } else resto.push(a);
}
const query = resto.join(" ").trim();
if (query === "") {
  console.error("Falta el query: node scripts/docs-context.mjs [--json] <tema|modulo|id>");
  process.exit(1);
}

const docs = cargarCandidatos(raiz);
const resultado = buscarContexto(query, docs);
if (resultado.total === 0) {
  console.error(`sin resultados para "${query}"`);
  process.exit(1);
}
if (json) console.log(JSON.stringify(resultado, null, 2));
else process.stdout.write(formatearTexto(resultado));
