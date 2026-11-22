#!/usr/bin/env node
// Diagnóstico previo a `npm run verify`: separa fallos del cambio de fallos del
// entorno (arch con archivos ajenos al diff, bases con migraciones desalineadas).
// Es informativo: siempre sale con código 0 para no alterar el gate de merge.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { clasificarArch, estadoMigraciones } from "./verify-preflight-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function archivosCambiados() {
  const lineas = [git("diff", "--name-only", "HEAD"), git("ls-files", "--others", "--exclude-standard")];
  return lineas
    .flatMap((s) => s.split(/\r?\n/))
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
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
  const cambiados = archivosCambiados();
  const arch = spawnSync("npm", ["run", "check:arch"], { cwd: root, encoding: "utf8" });
  const salida = `${arch.stdout ?? ""}\n${arch.stderr ?? ""}`;
  const fallos = clasificarArch(salida, cambiados);

  console.log("--- check:arch ---");
  if (arch.status === 0) {
    console.log("ok");
  } else if (fallos.length === 0) {
    console.log("falló, pero no se pudo atribuir ningún archivo (revisá la salida arriba)");
  } else {
    for (const f of fallos) {
      console.log(`${f.archivo} [${f.origen === "mio" ? "MIO" : "PREEXISTENTE"}] -> ${f.ruta}`);
    }
  }

  const entries = journalEntries();
  console.log("--- migraciones ---");
  let sucio = fallos.some((f) => f.origen === "preexistente");
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
    console.log(`${nombre}: DB=${estado.aplicadas} journal=${estado.journal} [${estado.motivo.toUpperCase()}]${estado.detalle ? " " + estado.detalle : ""}`);
    if (!estado.ok) sucio = true;
  }

  console.log(`--- entorno: ${sucio ? "SUCIO (no atribuyas estos fallos al cambio)" : "limpio"} ---`);
}

await main();
