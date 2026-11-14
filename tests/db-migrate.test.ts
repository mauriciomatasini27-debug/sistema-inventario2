import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  hashMigration,
  splitStatements,
  tablaDeStatement,
  planPendientes,
  filtrarStatementsPorTablas,
} from "../scripts/db-migrate-lib.mjs";
const hayPG = Boolean(process.env.PG_TEST_URL_A);

describe("P1-69 db-migrate-lib", () => {
  it("hashea el SQL completo como drizzle-orm", () => {
    const sql = 'ALTER TABLE "products" ADD COLUMN "x" int;\n';
    expect(hashMigration(sql)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashMigration(sql)).toBe(hashMigration(sql));
    expect(hashMigration(sql)).not.toBe(hashMigration(sql + " "));
  });

  it("parte por statement-breakpoint e ignora comentarios de línea", () => {
    const parts = splitStatements(
      `-- nota\nALTER TABLE "a" ADD COLUMN "x" int;\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS "a_x" ON "a" ("x");\n`,
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('ALTER TABLE "a"');
    expect(parts[1]).toContain('ON "a"');
  });

  it("extrae tabla de ALTER y de CREATE INDEX", () => {
    expect(tablaDeStatement('ALTER TABLE "inventory_counts" ADD COLUMN "tenant_id" uuid;')).toBe(
      "inventory_counts",
    );
    expect(tablaDeStatement('CREATE INDEX IF NOT EXISTS "x" ON "products" ("tenant_id");')).toBe(
      "products",
    );
    expect(tablaDeStatement("SELECT 1")).toBeNull();
  });

  it("pendientes = cola del journal después de appliedCount", () => {
    const journalEntries = [
      { idx: 0, tag: "0000_a", when: 1 },
      { idx: 1, tag: "0001_b", when: 2 },
      { idx: 2, tag: "0002_c", when: 3 },
    ];
    const cero = planPendientes({ journalEntries, appliedCount: 0 });
    expect(cero.ok && cero.pendientes.map((p) => p.tag)).toEqual(["0000_a", "0001_b", "0002_c"]);
    const dos = planPendientes({ journalEntries, appliedCount: 2 });
    expect(dos.ok && dos.pendientes.map((p) => p.tag)).toEqual(["0002_c"]);
    const full = planPendientes({ journalEntries, appliedCount: 3 });
    expect(full.ok && full.pendientes).toEqual([]);
  });

  it("niega si la DB tiene más filas que el journal", () => {
    const r = planPendientes({
      journalEntries: [{ idx: 0, tag: "0000_a", when: 1 }],
      appliedCount: 2,
    });
    expect(r.ok).toBe(false);
  });

  it("saltea statements cuya tabla no existe y corre el resto", () => {
    const statements = [
      'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;',
      'ALTER TABLE "inventory_counts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;',
      'CREATE INDEX IF NOT EXISTS "products_tenant_id_idx" ON "products" ("tenant_id");',
    ];
    const { run, skip } = filtrarStatementsPorTablas({
      statements,
      tablasExistentes: ["products"],
    });
    expect(run).toHaveLength(2);
    expect(skip).toEqual([
      {
        tabla: "inventory_counts",
        sql: 'ALTER TABLE "inventory_counts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;',
      },
    ]);
  });

  it("no saltea CREATE TABLE aunque la tabla no exista en la base", () => {
    const create = 'CREATE TABLE IF NOT EXISTS "mp_preapproval_tenants" ("id" uuid PRIMARY KEY NOT NULL);';
    const { run, skip } = filtrarStatementsPorTablas({
      statements: [create],
      tablasExistentes: [],
    });
    expect(run).toEqual([create]);
    expect(skip).toEqual([]);
  });

  it("corre índice y UPDATE en tablas creadas antes en el mismo archivo", () => {
    const statements = [
      'CREATE TABLE IF NOT EXISTS "inventory_counts" ("id" uuid PRIMARY KEY NOT NULL);',
      'CREATE INDEX IF NOT EXISTS "inventory_counts_tenant_id_idx" ON "inventory_counts" ("tenant_id");',
      'CREATE TABLE IF NOT EXISTS "mp_preapproval_tenants" ("id" uuid PRIMARY KEY NOT NULL);',
      'UPDATE "mp_webhook_events" SET "tenant_id" = t."tenant_id" FROM "mp_preapproval_tenants" t WHERE t."preapproval_id" = "mp_webhook_events"."preapproval_id";',
    ];
    const { run, skip } = filtrarStatementsPorTablas({
      statements,
      tablasExistentes: ["mp_webhook_events"],
    });
    expect(skip).toEqual([]);
    expect(run).toHaveLength(4);
    expect(run[1]).toContain('ON "inventory_counts"');
    expect(run[3]).toContain("mp_preapproval_tenants");
  });

  it("saltea ALTER de tabla inexistente no creada en el archivo (0043)", () => {
    const statements = [
      'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;',
      'ALTER TABLE "inventory_counts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;',
    ];
    const { run, skip } = filtrarStatementsPorTablas({
      statements,
      tablasExistentes: ["products"],
    });
    expect(run).toHaveLength(1);
    expect(skip[0]?.tabla).toBe("inventory_counts");
  });

  it("extrae tabla de CREATE TABLE", () => {
    expect(tablaDeStatement('CREATE TABLE IF NOT EXISTS "foo" ("x" int);')).toBe("foo");
    expect(tablaDeStatement('CREATE TABLE "bar" ("x" int);')).toBe("bar");
  });
});

async function crearBaseSinKit(nombreDb: string, urlReferencia: string): Promise<string> {
  const u = new URL(urlReferencia);
  u.pathname = `/${nombreDb}`;
  const url = u.toString();
  const mantenimiento = new URL(urlReferencia);
  mantenimiento.pathname = "/postgres";
  const admin = postgres(mantenimiento.toString(), { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${nombreDb}"`);
  } catch (e) {
    if (typeof e !== "object" || e === null || !("code" in e) || e.code !== "42P04") throw e;
  } finally {
    await admin.end();
  }
  return url;
}

describe.skipIf(!hayPG)("P1-69 db-migrate runner en Postgres", () => {
  it(
    "0001..0044 con el runner: 0044 crea tablas nuevas (estado tipo piloto al 0043)",
    async () => {
      const url = await crearBaseSinKit("db_migrate_p69_run", process.env.PG_TEST_URL_A ?? "");
      execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        stdio: "pipe",
      });

      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
        entries: { tag: string }[];
      };
      const db = postgres(url, { max: 1 });
      try {
        const n = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;
        expect(n[0]?.n).toBe(journal.entries.length);
        const reg = await db`
          select to_regclass('public.inventory_counts') as inv,
                 to_regclass('public.platform_feedback_reports') as pfr
        `;
        expect(reg[0]?.inv).toBe("inventory_counts");
        expect(reg[0]?.pfr).toBe("platform_feedback_reports");
      } finally {
        await db.end();
      }
    },
    300_000,
  );
});
