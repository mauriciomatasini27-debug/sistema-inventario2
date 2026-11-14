#!/usr/bin/env node
// P1-69: migrate por journal idx; saltea ALTER/INDEX si la tabla no existe.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashMigration,
  splitStatements,
  planPendientes,
  filtrarStatementsPorTablas,
  sslPostgresDesdeUrl,
} from "./db-migrate-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const soloCheck = process.argv.includes("--check");

async function main() {
  const url = process.env.TENANT_DATABASE_URL ?? "";
  if (!url) {
    console.error("FAIL falta TENANT_DATABASE_URL");
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8"));
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { ssl: sslPostgresDesdeUrl(url), max: 1 });

  try {
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);

    const filas = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
    const appliedCount = filas[0].n;
    const plan = planPendientes({ journalEntries: journal.entries, appliedCount });
    if (!plan.ok) {
      console.error(`FAIL ${plan.error}`);
      process.exitCode = 1;
      return;
    }

    console.log(`journal=${journal.entries.length} aplicadas=${appliedCount} pendientes=${plan.pendientes.length}`);
    if (plan.pendientes.length === 0) {
      console.log("ok: nada pendiente");
      return;
    }

    for (const p of plan.pendientes) console.log(`pendiente ${p.tag}`);
    if (soloCheck) {
      process.exitCode = 2;
      return;
    }

    const tablas = new Set(
      (await sql`
        select table_name from information_schema.tables where table_schema = 'public'
      `).map((r) => r.table_name),
    );

    for (const entry of plan.pendientes) {
      const file = resolve(root, "drizzle", `${entry.tag}.sql`);
      const body = readFileSync(file, "utf8");
      const hash = hashMigration(body);
      const ya = await sql`select 1 from drizzle.__drizzle_migrations where hash = ${hash} limit 1`;
      if (ya.length) {
        console.log(`${entry.tag}: hash ya registrado, skip SQL`);
        continue;
      }

      const parts = splitStatements(body);
      const { run, skip } = filtrarStatementsPorTablas({ statements: parts, tablasExistentes: tablas });
      for (const s of skip) console.log(`${entry.tag}: skip tabla ausente ${s.tabla}`);

      await sql.begin(async (tx) => {
        for (const stmt of run) await tx.unsafe(stmt);
        await tx`
          insert into drizzle.__drizzle_migrations (hash, created_at)
          values (${hash}, ${entry.when})
        `;
      });

      for (const stmt of run) {
        const m = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i);
        if (m) tablas.add(m[1]);
      }
      console.log(`${entry.tag}: ok run=${run.length} skip=${skip.length}`);
    }

    console.log("ok: migrate completo");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`FAIL migrate: ${msg}`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();