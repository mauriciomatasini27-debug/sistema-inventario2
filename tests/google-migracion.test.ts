import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("migración 0030 google", () => {
  it("crea las tablas, las columnas, el índice parcial y el guard append-only", async () => {
    const url = await asegurarBasePrivada("google_migracion_0030", URL_A!);
    const sql = postgres(url, { max: 1 });
    try {
      const tablas = await sql<{ table_name: string }[]>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'google_connections',
            'gmail_watch_routes',
            'gmail_connection_events',
            'email_ingestion_drafts',
            'gmail_ingestion_jobs'
          )
        order by table_name
      `;
      expect(tablas.map((t) => t.table_name)).toEqual([
        "email_ingestion_drafts",
        "gmail_connection_events",
        "gmail_ingestion_jobs",
        "gmail_watch_routes",
        "google_connections",
      ]);

      const billCols = await sql<{ column_name: string }[]>`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'utility_bills'
          and column_name in ('canal', 'gmail_attachment_id')
        order by column_name
      `;
      expect(billCols.map((c) => c.column_name)).toEqual(["canal", "gmail_attachment_id"]);

      const indices = await sql<{ indexname: string }[]>`
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'gmail_watch_routes'
          and indexname = 'gmail_watch_routes_email_hmac_activo_idx'
      `;
      expect(indices).toHaveLength(1);

      const draftCols = await sql<{ column_name: string }[]>`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'email_ingestion_drafts'
          and column_name = 'gmail_attachment_id'
      `;
      expect(draftCols.map((c) => c.column_name)).toEqual(["gmail_attachment_id"]);

      const triggers = await sql<{ tgname: string }[]>`
        select tgname
        from pg_trigger
        where tgrelid = 'gmail_connection_events'::regclass
          and tgname = 'gmail_connection_events_no_update'
      `;
      expect(triggers).toHaveLength(1);

      const [tenant] = await sql<{ id: string }[]>`
        insert into tenants (nombre_comercio, slug, plan)
        values ('Google 0030', ${`google-0030-${randomUUID().slice(0, 8)}`}, 'demo')
        returning id
      `;
      if (!tenant) throw new Error("no se creó el tenant de prueba");

      await sql`
        insert into gmail_connection_events (tenant_id, connection_id, evento)
        values (${tenant.id}, ${randomUUID()}, 'conectada')
      `;
      await expect(sql`update gmail_connection_events set motivo = 'x'`).rejects.toThrow(
        /append-only/,
      );

      const hmac = `hmac-0030-${randomUUID()}`;
      await sql`
        insert into gmail_watch_routes (email_hmac, tenant_id, connection_id, activo)
        values (${hmac}, ${tenant.id}, ${randomUUID()}, true)
      `;
      await expect(sql`
        insert into gmail_watch_routes (email_hmac, tenant_id, connection_id, activo)
        values (${hmac}, ${tenant.id}, ${randomUUID()}, true)
      `).rejects.toThrow(/duplicate key/);

      await sql`update gmail_watch_routes set activo = false where email_hmac = ${hmac}`;
      await sql`
        insert into gmail_watch_routes (email_hmac, tenant_id, connection_id, activo)
        values (${hmac}, ${tenant.id}, ${randomUUID()}, true)
      `;
    } finally {
      await sql.end();
    }
  }, 60_000);
});
