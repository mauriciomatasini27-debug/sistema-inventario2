#!/usr/bin/env node
// AUD-S1/ADR-0125: `npm run audit:db` diffea la base real (information_schema) contra
// src/db/schema*.ts y drizzle/*.sql. Solo lectura: no escribe en ninguna base.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  codigoSalida,
  diffEstados,
  estadoDesdeBase,
  formatearHallazgo,
  fusionarEstados,
  parsearEsquemaTS,
  parsearMigracionesSql,
  resumirDiferencias,
} from "./audit-db-lib.mjs";
import { sslPostgresDesdeUrl } from "./db-migrate-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const usarJson = args.includes("--json");
const estricto = args.includes("--estricto");
const indiceUrl = args.indexOf("--url");
const urlExplicita = indiceUrl >= 0 ? args[indiceUrl + 1] : null;

function urlBase() {
  return urlExplicita ?? process.env.TENANT_DATABASE_URL ?? process.env.AUDIT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
}

function describirBase(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(url no parseable)";
  }
}

function archivosEsquema() {
  const dir = resolve(root, "src/db");
  return readdirSync(dir)
    .filter((n) => /^schema.*\.ts$/.test(n))
    .sort()
    .map((nombre) => ({ nombre, ruta: resolve(dir, nombre), fuente: readFileSync(resolve(dir, nombre), "utf8") }));
}

function archivosMigraciones() {
  const dir = resolve(root, "drizzle");
  const disponibles = new Set(readdirSync(dir).filter((n) => n.endsWith(".sql")));
  const journalRuta = resolve(dir, "meta/_journal.json");
  let orden = [];
  try {
    const journal = JSON.parse(readFileSync(journalRuta, "utf8"));
    orden = (journal.entries ?? []).map((e) => `${e.tag}.sql`).filter((n) => disponibles.has(n));
  } catch {
    orden = [];
  }
  if (orden.length === 0) orden = [...disponibles].sort();
  return orden.map((nombre) => ({ nombre, sql: readFileSync(resolve(dir, nombre), "utf8") }));
}

async function leerBase(url) {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { ssl: sslPostgresDesdeUrl(url), max: 1, connect_timeout: 10 });
  try {
    const tablas = (await sql`select table_name as tabla from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`).map(
      (r) => r.tabla,
    );
    const columnas = await sql`
      select table_name as tabla, column_name as columna, data_type, udt_name, character_maximum_length as largo,
             is_nullable, column_default as "default"
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `;
    const indices = await sql`
      select indexname as nombre, tablename as tabla, indexdef
      from pg_indexes
      where schemaname = 'public' and indexname not like '%_pkey'
      order by tablename, indexname
    `;
    const pks = await sql`
      select tc.table_name as tabla, kcu.column_name as columna
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_schema = tc.constraint_schema and kcu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
      order by tc.table_name, kcu.ordinal_position
    `;
    const constraintsPk = (
      await sql`
        select con.conname as nombre
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where con.contype = 'p' and n.nspname = 'public'
      `
    ).map((r) => r.nombre);
    const fksCrudas = await sql`
      select con.conname as nombre,
             rel.relname as tabla,
             (select array_agg(att.attname order by k.ord)
                from unnest(con.conkey) with ordinality as k(attnum, ord)
                join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum) as columnas,
             frel.relname as ref_tabla,
             (select array_agg(att2.attname order by k.ord)
                from unnest(con.confkey) with ordinality as k(attnum, ord)
                join pg_attribute att2 on att2.attrelid = con.confrelid and att2.attnum = k.attnum) as ref_columnas
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      join pg_class frel on frel.oid = con.confrelid
      where con.contype = 'f' and n.nspname = 'public'
      order by tabla, nombre
    `;
    const fks = fksCrudas.map((f) => ({
      tabla: f.tabla,
      columnas: [...(f.columnas ?? [])],
      refTabla: f.ref_tabla,
      refColumnas: [...(f.ref_columnas ?? [])],
    }));
    return estadoDesdeBase({ tablas, columnas, indices, pks, fks, constraintsPk });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function estadoEsperadoSchema() {
  const estado = { tablas: {}, fks: [] };
  for (const archivo of archivosEsquema()) {
    fusionarEstados(estado, parsearEsquemaTS(archivo.fuente));
  }
  return estado;
}

async function main() {
  const url = urlBase();
  if (!url) {
    console.error("FAIL audit:db sin base. Definí TENANT_DATABASE_URL (o AUDIT_DATABASE_URL / DATABASE_URL), o pasá --url <dsn>.");
    process.exitCode = 2;
    return;
  }

  const esquema = archivosEsquema();
  const migraciones = archivosMigraciones();

  let base;
  try {
    base = await leerBase(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`FAIL audit:db no pudo leer la base ${describirBase(url)}: ${msg}`);
    process.exitCode = 2;
    return;
  }

  const esperadoSchema = estadoEsperadoSchema();
  const esperadoMigraciones = parsearMigracionesSql(migraciones);

  const diferencias = [
    diffEstados(base, esperadoSchema, { fuente: "schema" }),
    diffEstados(base, esperadoMigraciones, { fuente: "migraciones", reportarSobrantesIndices: true, estricto }),
  ];
  const resumen = resumirDiferencias(diferencias);
  const codigo = codigoSalida(resumen);

  if (usarJson) {
    console.log(
      JSON.stringify(
        {
          base: describirBase(url),
          esquema: esquema.map((a) => a.nombre),
          migraciones: migraciones.map((a) => a.nombre),
          estricto,
          resumen,
          diferencias,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `audit:db base=${describirBase(url)} schema=${esquema.length} archivos migraciones=${migraciones.length} archivos tablas_base=${Object.keys(base.tablas).length}`,
    );
    for (const diferencia of diferencias) {
      const titulo = diferencia.fuente === "schema" ? "src/db/schema*.ts" : "drizzle/*.sql";
      console.log(`\n== vs ${titulo} ==`);
      if (diferencia.hallazgos.length === 0) {
        console.log("sin drift");
        continue;
      }
      for (const h of diferencia.hallazgos) console.log(`- ${formatearHallazgo(h)}`);
    }
    const detalle = Object.entries(resumen.porCategoria)
      .map(([categoria, n]) => `${categoria}=${n}`)
      .join(" ");
    console.log(`\nresumen: ${resumen.total} hallazgos en ${resumen.tablas} tablas${detalle ? ` (${detalle})` : ""}`);
    console.log(codigo === 0 ? "ok: sin drift" : "FAIL: hay drift");
  }

  process.exitCode = codigo;
}

await main();
