import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("migración 0051 dedupe gmail por tenant", () => {
  it("expone gmail_ingestion_jobs_tenant_message_unique y sin el índice global", async () => {
    const url = await asegurarBasePrivada("gmail_dedupe_migracion_0051", URL_A!);
    const sql = postgres(url, { max: 1 });
    try {
      const nuevo = await sql<{ indexname: string }[]>`
        select indexname from pg_indexes
        where schemaname = 'public'
          and tablename = 'gmail_ingestion_jobs'
          and indexname = 'gmail_ingestion_jobs_tenant_message_unique'
      `;
      expect(nuevo).toHaveLength(1);

      const viejo = await sql<{ indexname: string }[]>`
        select indexname from pg_indexes
        where schemaname = 'public'
          and tablename = 'gmail_ingestion_jobs'
          and indexname = 'gmail_ingestion_jobs_message_id_unique'
      `;
      expect(viejo).toHaveLength(0);
    } finally {
      await sql.end();
    }
  }, 60_000);
});