#!/usr/bin/env node
// Diagnóstico del entorno antes de `npm run verify`: separa fallos del cambio
// de fallos ajenos (arch con archivos fuera del diff, bases desalineadas).
// Es informativo: siempre sale con código 0 para no alterar el gate de merge.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { archivosPropios, clasificarFallosArch, estadoArch, estadoMigraciones } from "./verify-preflight-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sinArch = process.argv.includes("--sin-arch");

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function baseRef() {
  const explicita = String(process.env.PREFLIGHT_BASE ?? "").trim();
  if (explicita) return explicita;
  for (const candidato of ["origin/main", "main"]) {
    const base = git("merge-base", "HEAD", candidato).trim();
    if (base) return base;
  }
  return git("rev-parse", "HEAD~1").trim() || "HEAD";
}

function journalEntries() {
  return JSON.parse(readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8")).entries;
}

function urlLocal(db) {
  try {
    return execFileSync("bash", ["scripts/pg-local.sh", "url", db], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function conteoMigraciones(url) {
  if (!url) return null;
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1 });
  try {
    const filas = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
    return filas[0]?.n ?? 0;
  } catch {
    return null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const base = baseRef();
  const cambiados = archivosPropios(
    git("diff", "--name-only", `${base}...HEAD`),
    git("diff", "--name-only", "HEAD"),
    git("ls-files", "--others", "--exclude-standard"),
  );

  let sucio = false;
  console.log("--- check:arch ---");
  if (sinArch) {
    console.log("omitido (--sin-arch)");
  } else {
    const arch = spawnSync("npm", ["run", "check:arch"], { cwd: root, encoding: "utf8" });
    const fallos = clasificarFallosArch(`${arch.stdout ?? ""}\n${arch.stderr ?? ""}`, cambiados);
    const estado = estadoArch(arch.status, fallos);
    console.log(`arch: ${estado.estado}${arch.status === 0 ? "" : ` (base ${base})`}`);
    for (const f of fallos) {
      console.log(`${f.archivo} [${f.origen === "mio" ? "MIO" : "PREEXISTENTE"}] -> ${f.ruta}`);
    }
    sucio = estado.sucio;
  }

  const entries = journalEntries();
  console.log("--- migraciones ---");
  for (const [nombre, url] of [
    ["A", process.env.PG_TEST_URL_A || urlLocal("pers_tenant_a")],
    ["B", process.env.PG_TEST_URL_B || urlLocal("pers_tenant_b")],
  ]) {
    const aplicadas = await conteoMigraciones(url);
    if (aplicadas === null) {
      console.log(`${nombre}: sin tabla de migraciones (base no disponible)`);
      sucio = true;
      continue;
    }
    const estado = estadoMigraciones(aplicadas, entries);
    console.log(
      `${nombre}: DB=${estado.aplicadas} journal=${estado.journal} [${estado.motivo.toUpperCase()}]${estado.detalle ? " " + estado.detalle : ""}`,
    );
    if (estado.remediacion) console.log(`  remediacion: ${estado.remediacion}`);
    if (!estado.ok) sucio = true;
  }

  console.log(`--- entorno: ${sucio ? "SUCIO (no atribuyas estos fallos al cambio)" : "limpio"} ---`);
}

await main();
