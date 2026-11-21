import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  splitStatements,
  sslPostgresDesdeUrl,
  filtrarStatementsPorTablas,
} from "../scripts/db-migrate-lib.mjs";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);
const TAG = "0054_devolucion_por_comercio";

function journal(): { entries: { tag: string; when: number }[] } {
  return JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: { tag: string; when: number }[];
  };
}

async function crearBase(nombreDb: string, urlReferencia: string): Promise<string> {
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

/** Igual que scripts/db-migrate.mjs: P1-69 saltea ALTER de tablas aún no creadas. */
async function aplicarHasta(tag: string, url: string): Promise<void> {
  const idx = journal().entries.findIndex((e) => e.tag === tag);
  if (idx < 0) throw new Error(`tag ${tag} no está en journal`);
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
    for (const entry of journal().entries.slice(0, idx + 1)) {
      const body = readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
      const { run } = filtrarStatementsPorTablas({
        statements: splitStatements(body),
        tablasExistentes: tablas,
      });
      for (const stmt of run) await sql.unsafe(stmt);
      for (const stmt of run) {
        const m = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i);
        if (m) tablas.add(m[1]!);
      }
    }
  } finally {
    await sql.end();
  }
}

async function aplicarSolo(tag: string, url: string): Promise<void> {
  const sql = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
  try {
    const body = readFileSync(`drizzle/${tag}.sql`, "utf8");
    for (const stmt of splitStatements(body)) await sql.unsafe(stmt);
  } finally {
    await sql.end();
  }
}

describe("P1-96 migración 0054: D-* por comercio", () => {
  it("el journal registra 0054 justo después de 0053", () => {
    const entries = journal().entries;
    expect(entries.findIndex((e) => e.tag === TAG)).toBe(54);
    expect(entries.length).toBe(55);
    expect(entries.at(-1)?.tag).toBe(TAG);
  });
});

describe.skipIf(!hayPG)("P1-96 migración 0054 en Postgres", () => {
  it(
    "hace tenant_id NOT NULL, unique por comercio, contadores por tenant y es idempotente",
    async () => {
      const url = await crearBase(`m54_devolucion_${Date.now()}`, URL_A!);
      await aplicarHasta("0053_servicios_pagos_tenant", url);
      const tidA = randomUUID();
      const tidB = randomUUID();
      const ventaA1 = randomUUID();
      const ventaA2 = randomUUID();
      const ventaB1 = randomUUID();
      const sql = postgres(url, { max: 1 });
      try {
        // Estado previo: A tiene D-000001 y D-000003; B tiene D-000002.
        // El D-* global impide que B tenga también D-000001.
        for (const [id, tid, key] of [
          [ventaA1, tidA, "v-a-1"],
          [ventaA2, tidA, "v-a-2"],
          [ventaB1, tidB, "v-b-1"],
        ] as const) {
          await sql`
            insert into sales (id, tenant_id, idempotency_key, medio, total_centavos, client_occurred_at)
            values (${id}, ${tid}, ${key}, 'Efectivo', 10_000, now())
          `;
        }
        for (const [saleId, numero, key] of [
          [ventaA1, "D-000001", "r-a-1"],
          [ventaA2, "D-000003", "r-a-3"],
          [ventaB1, "D-000002", "r-b-2"],
        ] as const) {
          await sql`
            insert into sale_returns
              (idempotency_key, sale_id, numero_devolucion, monto_centavos, acumulado_nuevo_centavos, medio, motivo, actor)
            values (${key}, ${saleId}, ${numero}, 1_000, 1_000, 'Efectivo', 'prueba', 'test')
          `;
        }

        await aplicarSolo(TAG, url);

        const columna = await sql<{ is_nullable: string; data_type: string }[]>`
          select is_nullable, data_type from information_schema.columns
          where table_name = 'sale_returns' and column_name = 'tenant_id'
        `;
        expect(columna).toHaveLength(1);
        expect(columna[0]!.is_nullable).toBe("NO");
        expect(columna[0]!.data_type).toBe("uuid");

        const backfill = await sql<{ numero_devolucion: string; tenant_id: string }[]>`
          select numero_devolucion, tenant_id from sale_returns order by numero_devolucion
        `;
        expect(backfill.map((r) => [r.numero_devolucion, r.tenant_id])).toEqual([
          ["D-000001", tidA],
          ["D-000002", tidB],
          ["D-000003", tidA],
        ]);

        const indices = await sql<{ indexname: string }[]>`
          select indexname from pg_indexes
          where schemaname = 'public' and tablename = 'sale_returns'
        `;
        const nombres = indices.map((r) => r.indexname);
        expect(nombres).toContain("sale_returns_tenant_numero_devolucion_unique");
        expect(nombres).not.toContain("sale_returns_numero_devolucion_unique");

        // Un mismo D-* en dos comercios ya no colisiona.
        const ventaB2 = randomUUID();
        await sql`
          insert into sales (id, tenant_id, idempotency_key, medio, total_centavos, client_occurred_at)
          values (${ventaB2}, ${tidB}, 'v-b-2', 'Efectivo', 10_000, now())
        `;
        await sql`
          insert into sale_returns
            (tenant_id, idempotency_key, sale_id, numero_devolucion, monto_centavos, acumulado_nuevo_centavos, medio, motivo, actor)
          values (${tidB}, 'r-b-1', ${ventaB2}, 'D-000001', 1_000, 1_000, 'Efectivo', 'mismo numero otro comercio', 'test')
        `;

        const contadores = await sql<{ tenant_id: string; ultimo: number }[]>`
          select tenant_id, ultimo from ticket_counters where id = 'devolucion' order by tenant_id
        `;
        expect(contadores.map((r) => [r.tenant_id, r.ultimo]).sort()).toEqual(
          [
            [tidA, 3],
            [tidB, 2],
          ].sort(),
        );

        // Reaplicar no cambia nada ni falla.
        await aplicarSolo(TAG, url);
        const contadoresTras = await sql<{ tenant_id: string; ultimo: number }[]>`
          select tenant_id, ultimo from ticket_counters where id = 'devolucion' order by tenant_id
        `;
        expect(contadoresTras).toEqual(contadores);
      } finally {
        await sql.end();
      }
    },
    120_000,
  );
});
