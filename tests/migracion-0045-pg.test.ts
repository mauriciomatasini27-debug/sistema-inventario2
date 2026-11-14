import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { hashMigration, splitStatements, sslPostgresDesdeUrl } from "../scripts/db-migrate-lib.mjs";

const hayPG = Boolean(process.env.PG_TEST_URL_A);

async function crearBase(nombreDb: string, urlReferencia: string): Promise<string> {
  const u = new URL(urlReferencia);
  u.pathname = `/${nombreDb}`;
  const url = u.toString();
  const mantenimiento = new URL(urlReferencia);
  mantenimiento.pathname = "/postgres";
  const admin = postgres(mantenimiento.toString(), { max: 1, ssl: sslPostgresDesdeUrl(mantenimiento.toString()) });
  try {
    await admin.unsafe(`CREATE DATABASE "${nombreDb}"`);
  } catch (e) {
    if (typeof e !== "object" || e === null || !("code" in e) || e.code !== "42P04") throw e;
  } finally {
    await admin.end();
  }
  return url;
}

async function aplicarHasta(tag: string, url: string): Promise<void> {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: { tag: string; when: number }[];
  };
  const idx = journal.entries.findIndex((e) => e.tag === tag);
  if (idx < 0) throw new Error(`tag ${tag} no está en journal`);
  const hasta = journal.entries.slice(0, idx + 1);
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
    for (const entry of hasta) {
      const body = readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
      for (const p of splitStatements(body)) {
        await sql.unsafe(p);
      }
      await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hashMigration(body)}, ${entry.when})`;
    }
  } finally {
    await sql.end();
  }
}

describe("P1-76 migración 0045_shared_tenant_sellar_nucleo", () => {
  it("journal registra 0045", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };
    expect(journal.entries.some((e) => e.tag === "0045_shared_tenant_sellar_nucleo")).toBe(true);
    expect(journal.entries.length).toBe(46);
  });
});

describe.skipIf(!hayPG)("P1-76 migración 0045 en Postgres", () => {
  it(
    "estado piloto (0044) con NULL → 0045 deja cero NULL y uniques compuestos",
    async () => {
      const nombre = `m45_piloto_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0044_piloto_schema_tenant_precios", url);
      const tid = randomUUID();
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        await db`insert into tenants (id, nombre_comercio, slug, plan, estado) values (${tid}::uuid, 'Piloto', 'piloto-m45', 'demo', 'activo')`;
        await db`insert into products (sku, nombre, precio_centavos, stock_actual, sector) values ('DEMO-1', 'Demo', 1000, 3, 'general')`;
        const n0 = await db`select count(*)::int as n from products where tenant_id is null`;
        expect(n0[0]?.n).toBe(1);
      } finally {
        await db.end();
      }
      execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      const db2 = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const n1 = await db2`select count(*)::int as n from products where tenant_id is null`;
        expect(n1[0]?.n).toBe(0);
        const isNn = await db2`
          select is_nullable from information_schema.columns
          where table_schema='public' and table_name='products' and column_name='tenant_id'`;
        expect(isNn[0]?.is_nullable).toBe("NO");
        const tidB = randomUUID();
        await db2`insert into tenants (id, nombre_comercio, slug, plan, estado) values (${tidB}::uuid, 'B', 'tenant-b-m45', 'demo', 'activo')`;
        await db2`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('MISMO-SKU', 'A', 100, 1, 'general', ${tid}::uuid)`;
        await db2`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('MISMO-SKU', 'B', 200, 1, 'general', ${tidB}::uuid)`;
        await expect(
          db2`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('MISMO-SKU', 'Dup', 50, 1, 'general', ${tid}::uuid)`,
        ).rejects.toThrow();
      } finally {
        await db2.end();
      }
    },
    300_000,
  );

  it(
    "duplicados (tenant_id, sku) abortan 0045 con mensaje claro",
    async () => {
      const nombre = `m45_dup_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0044_piloto_schema_tenant_precios", url);
      const tid = randomUUID();
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        await db`insert into tenants (id, nombre_comercio, slug, plan, estado) values (${tid}::uuid, 'Dup', 'dup-m45', 'demo', 'activo')`;
        await db`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('X', 'Uno', 1, 0, 'general', ${tid}::uuid)`;
        await db`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('X', 'Dos', 2, 0, 'general', ${tid}::uuid)`;
      } finally {
        await db.end();
      }
      expect(() =>
        execFileSync("node", ["scripts/db-migrate.mjs"], {
          env: { ...process.env, TENANT_DATABASE_URL: url },
          encoding: "utf8",
          stdio: "pipe",
        }),
      ).toThrow();
    },
    300_000,
  );

  it(
    "base vacía: runner 0001..0045 sin error",
    async () => {
      const nombre = `m45_vacia_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      const out = execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      expect(out).toContain("ok: migrate completo");
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: unknown[] };
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const n = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;
        expect(n[0]?.n).toBe(journal.entries.length);
      } finally {
        await db.end();
      }
    },
    300_000,
  );
});