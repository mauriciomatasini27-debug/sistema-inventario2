import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { cashMovements } from "../src/db/schema.js";
import { customerMovements } from "../src/db/schema-credito.js";
import { getTenantDb } from "../src/lib/db.js";
import { cobroFiado } from "../src/lib/repos/fiado.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const URL_A = process.env.PG_TEST_URL_A;
const PREFIJO = `p10-15-${Date.now().toString(36)}`;

describe.skipIf(!URL_A)("P10-15 cobro de fiado atomico entre credito y caja", () => {
  let db: ReturnType<typeof getTenantDb>;

  beforeAll(async () => {
    process.env.TENANT_DATABASE_URL = await asegurarBasePrivada("p10_15_fiado_atomico", URL_A ?? "");
    delete process.env.TENANT_MODE;
    db = getTenantDb();
    await db.execute(
      sql.raw(`
        CREATE OR REPLACE FUNCTION p10_15_falla_credito() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.idempotency_key LIKE 'p10-15-%' THEN
            RAISE EXCEPTION 'P10-15 fallo forzado';
          END IF;
          RETURN NEW;
        END $$;
      `),
    );
    await db.execute(sql.raw("DROP TRIGGER IF EXISTS p10_15_falla_credito ON customer_movements"));
    await db.execute(
      sql.raw(
        "CREATE TRIGGER p10_15_falla_credito BEFORE INSERT ON customer_movements FOR EACH ROW EXECUTE FUNCTION p10_15_falla_credito()",
      ),
    );
  });

  afterAll(async () => {
    await db.execute(sql.raw("DROP TRIGGER IF EXISTS p10_15_falla_credito ON customer_movements"));
    await db.execute(sql.raw("DROP FUNCTION IF EXISTS p10_15_falla_credito()"));
    await db.delete(customerMovements).where(sql`${customerMovements.idempotencyKey} LIKE 'p10-15-%'`);
    await db.delete(cashMovements).where(sql`${cashMovements.idempotencyKey} LIKE 'p10-15-%'`);
    delete process.env.TENANT_DATABASE_URL;
  });

  it("si falla la transaccion no escribe caja y el error se propaga", async () => {
    const key = `${PREFIJO}-cobro`;

    await expect(
      cobroFiado({ key, customerId: `${PREFIJO}-cli`, montoCentavos: 8000n, medio: "Efectivo" }),
    ).rejects.toThrow();

    const credito = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, key));
    const caja = await db.select().from(cashMovements).where(eq(cashMovements.idempotencyKey, key));
    expect(credito).toHaveLength(0);
    expect(caja).toHaveLength(0);
  });
});
