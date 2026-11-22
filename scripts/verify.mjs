import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dependenciasIncumplidas, planDePasos, resumir, textoResumen } from "./verify-lib.mjs";

const args = process.argv.slice(2);
const docsOnly = args.includes("--docs-only");
const iRecibo = args.indexOf("--receipt");
let rutaRecibo = iRecibo >= 0 ? args[iRecibo + 1] : ".verify-receipt.json";
if (args.includes("--no-receipt")) rutaRecibo = null;

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function correr(comando) {
  const r = spawnSync(comando, { stdio: "inherit", env: process.env, shell: true });
  return r.status ?? 1;
}

function comandoDe(paso) {
  const extra = paso.extra ?? [];
  if (paso.node) return ["node", paso.node, ...extra].join(" ");
  return [NPM, "run", paso.script, ...extra].join(" ");
}

function urlPG(db) {
  const r = spawnSync("bash", ["scripts/pg-local.sh", "url", db], { encoding: "utf8" });
  return r.status === 0 ? String(r.stdout ?? "").trim() : "";
}

function prepararPG() {
  if (process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B) return true;
  if (process.platform === "win32" || !existsSync("scripts/pg-local.sh")) return false;
  if (correr("bash scripts/pg-local.sh start") !== 0) return false;
  process.env.PG_TEST_URL_A = urlPG("pers_tenant_a");
  process.env.PG_TEST_URL_B = urlPG("pers_tenant_b");
  return Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
}

function head() {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? String(r.stdout ?? "").trim() : "";
}

if (!docsOnly && !existsSync("node_modules")) {
  console.error("verify: faltan dependencias, corré npm ci");
  process.exit(2);
}

let pg = false;
if (!docsOnly) {
  pg = prepararPG();
  if (!pg) {
    console.error("verify: falta Postgres (PG_TEST_URL_A/B). Corré en la caja o usá --docs-only.");
    process.exit(2);
  }
}

const resultados = [];
for (const paso of planDePasos({ docsOnly })) {
  const faltan = dependenciasIncumplidas(paso, resultados);
  if (faltan.length > 0) {
    const motivo = `porque falló ${faltan.join(", ")}`;
    resultados.push({ nombre: paso.nombre, skipped: true, motivo });
    console.log(`verify: se salta ${paso.nombre} (${motivo})`);
    continue;
  }
  const inicio = Date.now();
  const code = correr(comandoDe(paso));
  resultados.push({ nombre: paso.nombre, code, ms: Date.now() - inicio });
}

const resumen = resumir(resultados);
if (rutaRecibo) {
  const recibo = { fecha: new Date().toISOString(), head: head(), docsOnly, pg, ok: resumen.ok, pasos: resultados };
  writeFileSync(rutaRecibo, `${JSON.stringify(recibo, null, 2)}\n`);
}
console.log(textoResumen(resumen, { rutaRecibo }));
process.exit(resumen.ok ? 0 : 1);
