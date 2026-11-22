import { readFileSync } from "node:fs";
import postgres from "postgres";
import {
  hashMigration,
  splitStatements,
  sslPostgresDesdeUrl,
  filtrarStatementsPorTablas,
} from "../../scripts/db-migrate-lib.mjs";

export type EntradaJournal = { tag: string; when: number };

export function journal(): { entries: EntradaJournal[] } {
  return JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: EntradaJournal[];
  };
}

export async function crearBase(nombreDb: string, urlReferencia: string): Promise<string> {
  const u = new URL(urlReferencia);
  u.pathname = `/${nombreDb}`;
  const url = u.toString();
  const mantenimiento = new URL(urlReferencia);
  mantenimiento.pathname = "/postgres";
  const admin = postgres(mantenimiento.toString(), {
    max: 1,
    ssl: sslPostgresDesdeUrl(mantenimiento.toString()),
  });
  try {
    await admin.unsafe(`CREATE DATABASE "${nombreDb}"`);
  } catch (e) {
    if (typeof e !== "object" || e === null || !("code" in e) || e.code !== "42P04") throw e;
  } finally {
    await admin.end();
  }
  return url;
}

/**
 * Igual que scripts/db-migrate.mjs: P1-69 filtra ALTER de tablas aún no creadas.
 * `registrarAplicadas` inserta el hash en drizzle.__drizzle_migrations como hace
 * el runner real; los tests que luego lo invocan necesitan que esté ahí.
 */
export async function aplicarHasta(
  tag: string,
  url: string,
  { registrarAplicadas = false }: { registrarAplicadas?: boolean } = {},
): Promise<void> {
  const entries = journal().entries;
  const idx = entries.findIndex((e) => e.tag === tag);
  if (idx < 0) throw new Error(`tag ${tag} no está en journal`);
  const hasta = entries.slice(0, idx + 1);
  const sql = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `;
    const tablas = new Set(
      (await sql`select table_name from information_schema.tables where table_schema = 'public'`).map(
        (r) => r.table_name,
      ),
    );
    // 448: un viaje por statement hacía que este beforeAll pasara de 3-5s en
    // solitario a >15s con la suite en paralelo (Hook timed out sin asserts).
    // El orden se preserva: el batch se ejecuta como una sola consulta simple.
    const lote: string[] = [];
    const aplicadas: Array<{ hash: string; when: number }> = [];
    for (const entry of hasta) {
      const body = readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
      const parts = splitStatements(body);
      const { run } = filtrarStatementsPorTablas({ statements: parts, tablasExistentes: tablas });
      lote.push(...run);
      if (registrarAplicadas) aplicadas.push({ hash: hashMigration(body), when: entry.when });
      for (const stmt of run) {
        const m = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i);
        if (m) tablas.add(m[1]!);
      }
    }
    try {
      if (lote.length > 0) await sql.unsafe(lote.join("\n"));
      for (const a of aplicadas) {
        await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${a.hash}, ${a.when})`;
      }
    } catch (e) {
      const nombreDb = new URL(url).pathname.slice(1);
      throw new Error(`migración hasta ${tag} en ${nombreDb} falló: ${e instanceof Error ? e.message : String(e)}`);
    }
  } finally {
    await sql.end();
  }
}

export async function aplicarSolo(tag: string, url: string): Promise<void> {
  const sql = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
  try {
    const body = readFileSync(`drizzle/${tag}.sql`, "utf8");
    for (const stmt of splitStatements(body)) await sql.unsafe(stmt);
  } finally {
    await sql.end();
  }
}
