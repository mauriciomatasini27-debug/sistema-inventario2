import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { aplicarHasta, aplicarSolo, crearBase, journal } from "./helpers/migracion-pg.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);
const TAG = "0054_devolucion_por_comercio";

describe("P1-96 migración 0054: D-* por comercio", () => {
  it("el journal registra 0054 justo después de 0053", () => {
    const entries = journal().entries;
    expect(entries.findIndex((e) => e.tag === TAG)).toBe(54);
    expect(entries.length).toBe(56);
    // 0055 ya es la última; la comprueba su propio test de migración.
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

        // GREATEST: A ya tiene el contador en 10, por encima de su máximo
        // D-000003. La siembra no debe retrocederlo.
        await sql`
          insert into ticket_counters (tenant_id, id, ultimo)
          values (${tidA}, 'devolucion', 10)
        `;

        await aplicarSolo(TAG, url);

        const contadorAvanzado = await sql<{ ultimo: number }[]>`
          select ultimo from ticket_counters where tenant_id = ${tidA} and id = 'devolucion'
        `;
        expect(contadorAvanzado[0]?.ultimo).toBe(10);

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
            [tidA, 10],
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

  it(
    "falla en SET NOT NULL si la devolución no tiene venta conocida (fail-closed)",
    async () => {
      const url = await crearBase(`m54_huerfano_${Date.now()}`, URL_A!);
      await aplicarHasta("0053_servicios_pagos_tenant", url);
      const sql = postgres(url, { max: 1 });
      try {
        // Fila huérfana: no hay Dueño del que copiar tenant_id. La migración
        // no puede inventarlo y debe abortar en el SET NOT NULL.
        await sql`
          insert into sale_returns
            (idempotency_key, sale_id, numero_devolucion, monto_centavos, acumulado_nuevo_centavos, medio, motivo, actor)
          values (${randomUUID()}, ${randomUUID()}, 'D-000001', 1_000, 1_000, 'Efectivo', 'huérfana', 'test')
        `;
        let error: { code?: string; message?: string } | undefined;
        try {
          await aplicarSolo(TAG, url);
        } catch (e) {
          error = e as { code?: string; message?: string };
        }
        expect(error).toBeDefined();
        expect(error?.code).toBe("23502");
        expect(error?.message).toMatch(/column "tenant_id" of relation "sale_returns"/);
      } finally {
        await sql.end();
      }
    },
    120_000,
  );
});
