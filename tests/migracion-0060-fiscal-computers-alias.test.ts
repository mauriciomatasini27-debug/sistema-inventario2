import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { parsearEsquemaTS } from "../scripts/audit-db-lib.mjs";
import { aplicarHasta, aplicarSolo, crearBase, journal } from "./helpers/migracion-pg.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);
const TAG = "0060_fiscal_computers_alias_unico";

describe("AUD-FIX-S2 migración 0060: unique de fiscal_computers", () => {
  it("el journal registra 0060 y la punta coincide con el .sql más nuevo", () => {
    const entries = journal().entries;
    expect(entries.findIndex((e) => e.tag === TAG)).toBe(60);
    expect(entries.length).toBe(readdirSync("drizzle").filter((f) => f.endsWith(".sql")).length);
    const tags = readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    expect(entries.at(-1)?.tag).toBe(tags.at(-1));
  });

  it("el schema declara el índice compuesto y único", () => {
    const fuente = readFileSync("src/db/schema-fiscal-control.ts", "utf8");
    const { tablas } = parsearEsquemaTS(fuente);
    expect(tablas.fiscal_computers.indices.fiscal_computers_ambiente_alias_key).toMatchObject({
      columnas: ["ambiente", "alias"],
      unique: true,
    });
  });
});

describe.skipIf(!hayPG)("AUD-FIX-S2 migración 0060 en Postgres", () => {
  it("crea el índice, impide duplicados y es idempotente", async () => {
    const url = await crearBase(`m60_fiscal_computers_${Date.now()}`, URL_A!);
    await aplicarHasta("0059_whatsapp_estados", url);
    await aplicarSolo(TAG, url);
    await aplicarSolo(TAG, url);

    const sql = postgres(url, { max: 1 });
    try {
      const indices = await sql<{ indexdef: string }[]>`
        select indexdef from pg_indexes
        where schemaname = 'public'
          and tablename = 'fiscal_computers'
          and indexname = 'fiscal_computers_ambiente_alias_key'
      `;
      expect(indices).toHaveLength(1);
      expect(indices[0]!.indexdef).toContain("UNIQUE");
      expect(indices[0]!.indexdef).toContain("ambiente, alias");

      const insertar = (alias: string) => sql`
        insert into fiscal_computers (ambiente, alias, cuit_proveedor, cert_pem, key_ciphertext, kms_key_id)
        values ('homo', ${alias}, '20123456789', 'cert', 'key', 'kms')
      `;
      await insertar("principal");
      await expect(insertar("principal")).rejects.toMatchObject({ code: "23505" });
      await insertar("secundario");
    } finally {
      await sql.end();
    }
  });
});
