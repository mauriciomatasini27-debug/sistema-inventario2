import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  hashMigration,
  splitStatements,
  sslPostgresDesdeUrl,
  filtrarStatementsPorTablas,
} from "../scripts/db-migrate-lib.mjs";

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

/** Igual que scripts/db-migrate.mjs: P1-69 filtra ALTER si la tabla no existe aún. */
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
    const tablas = new Set(
      (await sql`select table_name from information_schema.tables where table_schema = 'public'`).map((r) => r.table_name),
    );
    for (const entry of hasta) {
      const body = readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
      const parts = splitStatements(body);
      const { run } = filtrarStatementsPorTablas({ statements: parts, tablasExistentes: tablas });
      for (const stmt of run) await sql.unsafe(stmt);
      await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hashMigration(body)}, ${entry.when})`;
      for (const stmt of run) {
        const m = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i);
        if (m) tablas.add(m[1]!);
      }
    }
  } finally {
    await sql.end();
  }
}

describe("P1-76 migración 0045_shared_tenant_sellar_nucleo", () => {
  it("journal registra 0045, 0046 rubro y 0047 periferia", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };
    expect(journal.entries.some((e) => e.tag === "0045_shared_tenant_sellar_nucleo")).toBe(true);
    expect(journal.entries.some((e) => e.tag === "0046_tenants_rubro")).toBe(true);
    expect(journal.entries.some((e) => e.tag === "0047_shared_tenant_periferia")).toBe(true);
    expect(journal.entries.length).toBe(49);
    const i46 = journal.entries.findIndex((e) => e.tag === "0046_tenants_rubro");
    const i47 = journal.entries.findIndex((e) => e.tag === "0047_shared_tenant_periferia");
    expect(i46).toBe(46);
    expect(i47).toBe(47);
    expect(journal.entries[i47]!.when).toBeGreaterThan(journal.entries[i46]!.when);
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
        await db.unsafe(`ALTER TABLE "product_codes" DROP CONSTRAINT IF EXISTS "product_codes_sku_products_sku_fk"`);
        await db.unsafe(`ALTER TABLE "stock_lots" DROP CONSTRAINT IF EXISTS "stock_lots_sku_products_sku_fk"`);
        await db.unsafe(`ALTER TABLE "product_photos" DROP CONSTRAINT IF EXISTS "product_photos_sku_products_sku_fk"`);
        await db.unsafe(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_sku_unique"`);
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
    "estado tipo prod: demos mismo created_at, FK compuestas y ticket_counters",
    async () => {
      const nombre = `m45_prod_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0044_piloto_schema_tenant_precios", url);
      const ts = "2024-01-15T12:00:00.000Z";
      const t1 = randomUUID();
      const t2 = randomUUID();
      const t3 = randomUUID();
      const t4 = randomUUID();
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        for (const [id, nombre] of [
          [t1, "Almacén Don Pepe"],
          [t2, "Kiosco Lo de Mauri"],
          [t3, "Demo Tres"],
          [t4, "Demo Cuatro"],
        ] as const) {
          await db`insert into tenants (id, nombre_comercio, slug, plan, estado, es_demo, created_at)
            values (${id}::uuid, ${nombre}, ${nombre.toLowerCase().replace(/\s+/g, "-")}, 'demo', 'activo', true, ${ts}::timestamptz)`;
        }
        for (const sku of ["DEMO-A", "DEMO-B", "DEMO-C"]) {
          await db`insert into products (sku, nombre, precio_centavos, stock_actual, sector) values (${sku}, ${sku}, 100, 1, 'general')`;
          await db`insert into product_codes (codigo, sku, padre) values (${sku + "-EAN"}, ${sku}, null)`;
          await db`insert into stock_lots (sku, cantidad, cantidad_restante) values (${sku}, 1, 1)`;
          await db`insert into product_photos (sku, url) values (${sku}, ${"https://example.test/" + sku + ".jpg"})`;
        }
        await db`insert into ticket_counters (id, ultimo) values ('mostrador', 0) on conflict do nothing`;
        await db`insert into ticket_counters (id, ultimo) values ('devolucion', 0) on conflict do nothing`;
      } finally {
        await db.end();
      }
      execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      const db2 = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const fk = await db2`
          select c.conname, pg_get_constraintdef(c.oid) as def
          from pg_constraint c
          join pg_class t on c.conrelid = t.oid
          where t.relname in ('product_codes','stock_lots','product_photos')
            and c.contype = 'f'
            and c.conname like '%tenant_sku_products%'`;
        expect(fk.length).toBe(3);
        for (const row of fk) {
          expect(row.def).toContain("FOREIGN KEY (tenant_id, sku)");
        }
        const nProdNull = await db2`select count(*)::int as n from products where tenant_id is null`;
        expect(nProdNull[0]?.n).toBe(0);
        const fallback = [t1, t2, t3, t4].sort()[0];
        const demoA = await db2`select tenant_id from products where sku = 'DEMO-A' limit 1`;
        const demoB = await db2`select tenant_id from products where sku = 'DEMO-B' limit 1`;
        expect(demoA[0]?.tenant_id).toBe(fallback);
        expect(demoB[0]?.tenant_id).toBe(fallback);
        const cont = await db2`select count(*)::int as n from ticket_counters where tenant_id is null`;
        expect(cont[0]?.n).toBe(0);
      } finally {
        await db2.end();
      }
    },
    300_000,
  );

  it(
    "base vacía: runner 0001..0047 sin error",
    async () => {
      const nombre = `m45_vacia_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      const out = execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      expect(out).toContain("ok: migrate completo");
      expect(out).toContain("0047_shared_tenant_periferia");
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: unknown[] };
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const n = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;
        expect(n[0]?.n).toBe(journal.entries.length);
        const tc = await db`select count(*)::int as n from ticket_counters`;
        expect(tc[0]?.n).toBe(0);
        const custNn = await db`
          select is_nullable from information_schema.columns
          where table_schema='public' and table_name='customers' and column_name='tenant_id'`;
        expect(custNn[0]?.is_nullable).toBe("NO");
      } finally {
        await db.end();
      }
    },
    300_000,
  );
});

describe.skipIf(!hayPG)("P1-81 migración 0047 tras 0046", () => {
  it(
    "con 0046 aplicada solo corre 0047; reintento sin error",
    async () => {
      const nombre = `m47_post46_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0046_tenants_rubro", url);
      const db0 = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const n = await db0`select count(*)::int as n from drizzle.__drizzle_migrations`;
        expect(n[0]?.n).toBe(47);
      } finally {
        await db0.end();
      }
      const out1 = execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      expect(out1).toMatch(/pendientes=1|0047_shared_tenant_periferia/);
      expect(out1).toContain("0047_shared_tenant_periferia");
      const out2 = execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      expect(out2).toContain("nada pendiente");
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const n = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;
        expect(n[0]?.n).toBe(49);
      } finally {
        await db.end();
      }
    },
    300_000,
  );
});