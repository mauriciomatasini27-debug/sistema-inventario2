import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { planDePasos, resumir } from "./verify-lib.mjs";

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
  const inicio = Date.now();
  const code = correr(comandoDe(paso));
  resultados.push({ nombre: paso.nombre, code, ms: Date.now() - inicio });
  if (code !== 0) break;
}

const { ok, fallidos, total } = resumir(resultados);
if (rutaRecibo) {
  const recibo = { fecha: new Date().toISOString(), head: head(), docsOnly, pg, ok, pasos: resultados };
  writeFileSync(rutaRecibo, `${JSON.stringify(recibo, null, 2)}\n`);
}
console.log(ok ? `verify ok (${total} pasos)` : `verify falló en: ${fallidos.join(", ")}`);
process.exit(ok ? 0 : 1);
