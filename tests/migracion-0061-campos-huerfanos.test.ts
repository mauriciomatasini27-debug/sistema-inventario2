import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { aplicarHasta, aplicarSolo, crearBase, journal } from "./helpers/migracion-pg.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);
const TAG = "0061_campos_huerfanos";

describe("AUD-FIX-S3..S7 migración 0061", () => {
  it("el journal registra 0061 y la punta coincide con el .sql más nuevo", () => {
    const entries = journal().entries;
    expect(entries.findIndex((e) => e.tag === TAG)).toBe(61);
    expect(entries.length).toBe(readdirSync("drizzle").filter((f) => f.endsWith(".sql")).length);
    const tags = readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    expect(entries.at(-1)?.tag).toBe(tags.at(-1));
  });
});

describe.skipIf(!hayPG)("AUD-FIX-S3..S7 migración 0061 en Postgres", () => {
  it("agrega las tres columnas con sus defaults y es idempotente", async () => {
    const url = await crearBase(`m61_campos_${Date.now()}`, URL_A!);
    await aplicarHasta("0060_fiscal_computers_alias_unico", url);
    await aplicarSolo(TAG, url);
    await aplicarSolo(TAG, url);

    const sql = postgres(url, { max: 1 });
    try {
      const columnas = await sql<
        { table_name: string; column_name: string; is_nullable: string; column_default: string | null }[]
      >`
        select table_name, column_name, is_nullable, column_default
        from information_schema.columns
        where (table_name, column_name) in (
          ('cash_movements', 'nota'),
          ('products', 'controla_vencimiento'),
          ('fiscal_wizard', 'modo_primera_factura')
        )
        order by table_name, column_name
      `;
      expect(columnas).toEqual([
        { table_name: "cash_movements", column_name: "nota", is_nullable: "YES", column_default: null },
        { table_name: "fiscal_wizard", column_name: "modo_primera_factura", is_nullable: "YES", column_default: null },
        { table_name: "products", column_name: "controla_vencimiento", is_nullable: "NO", column_default: "false" },
      ]);

      const tenant = crypto.randomUUID();
      const producto = await sql<{ controla_vencimiento: boolean }[]>`
        insert into products (tenant_id, sku, nombre, precio_centavos)
        values (${tenant}, 'M61-CV', 'Vence', 100)
        returning controla_vencimiento
      `;
      expect(producto[0]?.controla_vencimiento).toBe(false);

      const movimiento = await sql<{ nota: string | null }[]>`
        insert into cash_movements (tenant_id, idempotency_key, tipo, metodo, categoria_id, origen, monto_centavos, nota)
        values (${tenant}, 'm61-nota', 'ingreso', 'Efectivo', 'general', 'devolucion', 1000, 'arqueo')
        returning nota
      `;
      expect(movimiento[0]?.nota).toBe("arqueo");
    } finally {
      await sql.end();
    }
  });
});
