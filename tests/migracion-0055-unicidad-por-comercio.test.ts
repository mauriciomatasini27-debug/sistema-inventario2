import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { aplicarHasta, aplicarSolo, crearBase, journal } from "./helpers/migracion-pg.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);
const TAG = "0055_unicidad_por_comercio";

type Sql = ReturnType<typeof postgres>;
type Factura = { id: string; tenantId: string | null; accountId: string; messageId: string };
type Orden = { id: string; tenantId: string | null; key: string; numero: string; payeeId: string };

function factura(tenantId: string | null, messageId: string): Factura {
  return { id: randomUUID(), tenantId, accountId: randomUUID(), messageId };
}

function orden(tenantId: string | null, key: string, numero: string): Orden {
  return { id: randomUUID(), tenantId, key, numero, payeeId: randomUUID() };
}

function insertarFactura(sql: Sql, f: Factura) {
  return sql`
    insert into utility_bills (id, tenant_id, account_id, message_id, periodo, vencimiento, monto_centavos, origen)
    values (${f.id}, ${f.tenantId}, ${f.accountId}, ${f.messageId}, '2026-01', '2026-01-10', 1000, 'email')
  `;
}

function insertarOrden(sql: Sql, o: Orden) {
  return sql`
    insert into payment_orders (id, tenant_id, idempotency_key, numero, payee_id, concepto, monto_centavos, vence_el, metodo_sugerido, instruccion_tipo, instruccion_snapshot, creado_por)
    values (${o.id}, ${o.tenantId}, ${o.key}, ${o.numero}, ${o.payeeId}, 'prueba', 1000, now(), 'Efectivo', 'link_beneficiario', '{}'::jsonb, 'test')
  `;
}

describe("ADR-0123 migración 0055: unicidad por comercio", () => {
  it("el journal registra 0055 justo después de 0054", () => {
    const entries = journal().entries;
    expect(entries.findIndex((e) => e.tag === TAG)).toBe(55);
    expect(entries.length).toBe(57);
    expect(entries.at(-1)?.tag).toBe("0056_products_por_peso");
  });
});

describe.skipIf(!hayPG)("ADR-0123 migración 0055 en Postgres", () => {
  it(
    "dos comercios comparten claves, un comercio no las repite y los huérfanos siguen protegidos",
    async () => {
      const url = await crearBase(`m55_unicidad_${Date.now()}`, URL_A!);
      await aplicarHasta("0054_devolucion_por_comercio", url);
      const tidA = randomUUID();
      const tidB = randomUUID();
      const sql = postgres(url, { max: 1 });
      try {
        await insertarFactura(sql, factura(tidA, "msg-compartido"));
        await insertarOrden(sql, orden(tidA, "key-compartida", "OP-0001"));

        // Antes del cambio la unicidad es global: el comercio B no puede usar la misma clave.
        await expect(insertarFactura(sql, factura(tidB, "msg-compartido"))).rejects.toMatchObject({
          code: "23505",
        });

        await aplicarSolo(TAG, url);

        const indices = await sql<{ indexname: string }[]>`
          select indexname from pg_indexes where schemaname = 'public' and tablename in ('utility_bills', 'payment_orders')
        `;
        const nombres = indices.map((r) => r.indexname);
        for (const nombre of [
          "utility_bills_tenant_message_id_unique",
          "payment_orders_tenant_numero_unique",
          "payment_orders_tenant_idempotency_key_unique",
          "utility_bills_message_id_legacy_unique",
          "payment_orders_numero_legacy_unique",
          "payment_orders_idempotency_key_legacy_unique",
        ]) {
          expect(nombres).toContain(nombre);
        }
        for (const nombre of [
          "utility_bills_message_id_unique",
          "payment_orders_numero_unique",
          "payment_orders_idempotency_key_unique",
        ]) {
          expect(nombres).not.toContain(nombre);
        }

        // Dos comercios pueden usar las tres claves a la vez.
        await insertarFactura(sql, factura(tidB, "msg-compartido"));
        await insertarOrden(sql, orden(tidB, "key-compartida", "OP-0001"));

        // Dentro de un mismo comercio cada clave sigue siendo única.
        await expect(insertarFactura(sql, factura(tidA, "msg-compartido"))).rejects.toMatchObject({
          code: "23505",
        });
        await expect(
          insertarOrden(sql, orden(tidA, "key-compartida", "OP-0002")),
        ).rejects.toMatchObject({ code: "23505" });
        await expect(insertarOrden(sql, orden(tidA, "key-nueva", "OP-0001"))).rejects.toMatchObject({
          code: "23505",
        });

        // Las filas sin comercio conservan la protección global con el índice parcial.
        await insertarFactura(sql, factura(null, "msg-huerfano"));
        await expect(insertarFactura(sql, factura(null, "msg-huerfano"))).rejects.toMatchObject({
          code: "23505",
        });
        await insertarOrden(sql, orden(null, "key-huerfana", "OP-HUERFANA"));
        await expect(
          insertarOrden(sql, orden(null, "key-huerfana", "OP-OTRA")),
        ).rejects.toMatchObject({ code: "23505" });
        await expect(
          insertarOrden(sql, orden(null, "key-otra", "OP-HUERFANA")),
        ).rejects.toMatchObject({ code: "23505" });

        // No se borró ni se reasignó ninguna fila huérfana.
        const huerfanas = await sql<{ n: number }[]>`
          select count(*)::int as n from utility_bills where tenant_id is null and message_id = 'msg-huerfano'
        `;
        expect(huerfanas[0]?.n).toBe(1);

        // Reaplicar la migración no cambia nada ni falla.
        await aplicarSolo(TAG, url);
      } finally {
        await sql.end();
      }
    },
    120_000,
  );

  it(
    "el backfill asigna comercio solo cuando la fuente es inequívoca",
    async () => {
      const url = await crearBase(`m55_backfill_${Date.now()}`, URL_A!);
      await aplicarHasta("0054_devolucion_por_comercio", url);
      const tidA = randomUUID();
      const tidB = randomUUID();
      const sql = postgres(url, { max: 1 });
      try {
        await sql`
          insert into tenants (id, nombre_comercio, slug, plan, estado)
          values (${tidA}, 'A', ${`a-${tidA}`}, 'demo', 'activo'), (${tidB}, 'B', ${`b-${tidB}`}, 'demo', 'activo')
        `;
        // Un message_id con un solo comercio en los borradores; otro compartido por dos.
        await sql`
          insert into email_ingestion_drafts (id, tenant_id, message_id, origen, vence_en)
          values (${randomUUID()}, ${tidA}, 'msg-unico', 'email', now())
        `;
        for (const tid of [tidA, tidB]) {
          await sql`
            insert into email_ingestion_drafts (id, tenant_id, message_id, origen, vence_en)
            values (${randomUUID()}, ${tid}, 'msg-ambuo', 'email', now())
          `;
        }
        await sql`insert into utility_bills (id, tenant_id, account_id, message_id, periodo, vencimiento, monto_centavos, origen) values (${randomUUID()}, null, ${randomUUID()}, 'msg-unico', '2026-01', '2026-01-10', 1000, 'email')`;
        await sql`insert into utility_bills (id, tenant_id, account_id, message_id, periodo, vencimiento, monto_centavos, origen) values (${randomUUID()}, null, ${randomUUID()}, 'msg-ambuo', '2026-01', '2026-01-10', 1000, 'email')`;

        // Órdenes huérfanas: una con un egreso de un solo comercio, otra con
        // fuentes de dos comercios distintos (egreso A + factura B).
        const movA1 = randomUUID();
        const movA2 = randomUUID();
        for (const mov of [movA1, movA2]) {
          await sql`
            insert into cash_movements (id, tenant_id, idempotency_key, tipo, metodo, categoria_id, origen, monto_centavos)
            values (${mov}, ${tidA}, ${`cm-${mov}`}, 'egreso', 'Efectivo', 'pagos', 'test', 100)
          `;
        }
        const facturaB = randomUUID();
        await sql`
          insert into supplier_invoices (id, tenant_id, idempotency_key, supplier_cuit, fecha_iso, total_centavos, creado_por)
          values (${facturaB}, ${tidB}, 'si-b', '20-12345678-9', '2026-01-01', 100, 'test')
        `;
        await sql`
          insert into payment_orders (id, tenant_id, idempotency_key, numero, payee_id, concepto, monto_centavos, vence_el, metodo_sugerido, instruccion_tipo, instruccion_snapshot, creado_por, cash_movement_id)
          values (${randomUUID()}, null, 'key-unico', 'OP-UNICO', ${randomUUID()}, 'prueba', 100, now(), 'Efectivo', 'link_beneficiario', '{}'::jsonb, 'test', ${movA1})
        `;
        await sql`
          insert into payment_orders (id, tenant_id, idempotency_key, numero, payee_id, concepto, monto_centavos, vence_el, metodo_sugerido, instruccion_tipo, instruccion_snapshot, creado_por, cash_movement_id, supplier_invoice_id)
          values (${randomUUID()}, null, 'key-ambuo', 'OP-AMBUO', ${randomUUID()}, 'prueba', 100, now(), 'Efectivo', 'link_beneficiario', '{}'::jsonb, 'test', ${movA2}, ${facturaB}::text)
        `;

        await aplicarSolo(TAG, url);

        const facturas = await sql<{ message_id: string; tenant_id: string | null }[]>`
          select message_id, tenant_id from utility_bills order by message_id
        `;
        expect(facturas).toEqual([
          { message_id: "msg-ambuo", tenant_id: null },
          { message_id: "msg-unico", tenant_id: tidA },
        ]);
        const ordenes = await sql<{ numero: string; tenant_id: string | null }[]>`
          select numero, tenant_id from payment_orders order by numero
        `;
        expect(ordenes).toEqual([
          { numero: "OP-AMBUO", tenant_id: null },
          { numero: "OP-UNICO", tenant_id: tidA },
        ]);
      } finally {
        await sql.end();
      }
    },
    120_000,
  );
});
