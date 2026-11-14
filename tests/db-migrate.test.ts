import { describe, expect, it } from "vitest";
import {
  hashMigration,
  splitStatements,
  tablaDeStatement,
  planPendientes,
  filtrarStatementsPorTablas,
} from "../scripts/db-migrate-lib.mjs";

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
});
