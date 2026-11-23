import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Column } from "drizzle-orm";
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { roundTrip, verificarTipos } from "./helpers/roundtrip.js";
import { getTenantDb } from "../src/lib/db.js";
import {
  cashDueItems,
  cashMovements,
  cashQrReceipts,
  inventoryCounts,
  locations,
  productCodes,
  productPhotos,
  products,
  sales,
  stockCountLines,
  stockCounts,
  stockImports,
  stockLots,
  stockMovements,
  ticketLines,
  ticketPayments,
  tickets,
} from "../src/db/schema.js";
import {
  cashAuditLog,
  cashDays,
  cashDrawerDrops,
  cashReversals,
  closingSummaries,
  handoverCounts,
  shiftHandovers,
} from "../src/db/schema-caja.js";
import { customerMovements, customers } from "../src/db/schema-credito.js";
import {
  fiscalCustomers,
  fiscalDocuments,
  fiscalSequences,
  fiscalSettings,
  fiscalWizard,
} from "../src/db/schema-fiscal.js";

function columna(columnType: string, dataType: string): Column {
  return {
    name: "x",
    columnType,
    dataType,
    notNull: true,
    hasDefault: false,
    primary: false,
  } as unknown as Column;
}

describe("AUD-S4: el guard de tipos detecta pérdida (PRD-AUD-02)", () => {
  it("falla si un bigint vuelve como texto", () => {
    expect(() =>
      verificarTipos("sales", { totalCentavos: columna("PgBigInt64", "bigint") }, { totalCentavos: "9007199254740993" }),
    ).toThrow(/sales\.x: la base devolvió string .* espera bigint/);
  });

  it("falla si un timestamp vuelve como texto", () => {
    expect(() =>
      verificarTipos("sales", { createdAt: columna("PgTimestamp", "date") }, { createdAt: "2026-11-23 12:34:56.789" }),
    ).toThrow(/espera date/);
  });

  it("falla si un entero vuelve como bigint", () => {
    expect(() => verificarTipos("ticket_lines", { qty: columna("PgInteger", "number") }, { qty: 3n })).toThrow(
      /espera number/,
    );
  });

  it("acepta los tipos que el schema promete", () => {
    const cols = {
      totalCentavos: columna("PgBigInt64", "bigint"),
      qty: columna("PgInteger", "number"),
      createdAt: columna("PgTimestamp", "date"),
      porMedio: columna("PgJsonb", "json"),
      id: columna("PgUUID", "string"),
    };
    expect(() =>
      verificarTipos("ok", cols, {
        totalCentavos: 9007199254740993n,
        qty: 3,
        createdAt: new Date("2026-11-23T12:34:56.789Z"),
        porMedio: { efectivo: "100" },
        id: randomUUID(),
      }),
    ).not.toThrow();
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);

/** Hijas antes que padres: el borrado de `afterAll` no pelea con las claves ajenas. */
const ORDEN_DE_BORRADO = [
  "cash_qr_receipts",
  "cash_due_items",
  "handover_counts",
  "cash_reversals",
  "cash_audit_log",
  "cash_drawer_drops",
  "closing_summaries",
  "shift_handovers",
  "cash_days",
  "cash_movements",
  "ticket_payments",
  "ticket_lines",
  "tickets",
  "sales",
  "stock_count_lines",
  "stock_counts",
  "stock_movements",
  "stock_lots",
  "stock_imports",
  "inventory_counts",
  "product_codes",
  "product_photos",
  "products",
  "locations",
  "customer_movements",
  "customers",
  "fiscal_documents",
  "fiscal_sequences",
  "fiscal_customers",
  "fiscal_settings",
  "fiscal_wizard",
] as const;

describe.skipIf(!hayPG)("AUD-S4: round-trip por módulo crítico (ADR-0126)", () => {
  // Un tenant por corrida: las claves de unicidad (tenant_id, …) no chocan con
  // filas de corridas anteriores ni con los fixtures de otros tests PG.
  const tenant = randomUUID();

  beforeAll(() => {
    delete process.env.TENANT_MODE;
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
  });

  afterAll(async () => {
    if (!process.env.PG_TEST_URL_A) return;
    const db = getTenantDb();
    for (const tabla of ORDEN_DE_BORRADO) {
      await db.execute(sql`DELETE FROM ${sql.identifier(tabla)} WHERE tenant_id = ${tenant}`);
    }
    delete process.env.TENANT_DATABASE_URL;
  });

  describe("ventas", () => {
    it("sales, tickets, ticket_lines y ticket_payments vuelven con todos sus campos", async () => {
      const db = getTenantDb();
      const venta = await roundTrip(db, sales, { tenantId: tenant });
      await roundTrip(db, tickets, { tenantId: tenant, saleId: venta["id"] });
      await roundTrip(db, ticketLines, { tenantId: tenant, saleId: venta["id"], productId: randomUUID() });
      await roundTrip(db, ticketPayments, { tenantId: tenant, saleId: venta["id"], cashMovementId: randomUUID() });
    });
  });

  describe("caja", () => {
    it("movimiento, día, cierre, turnos, retiro, reversión, QR y vencimiento vuelven completos", async () => {
      const db = getTenantDb();
      const movimiento = await roundTrip(db, cashMovements, { tenantId: tenant });
      await roundTrip(db, cashDays, { tenantId: tenant, ultimoMovimientoId: movimiento["id"] });
      await roundTrip(db, closingSummaries, { tenantId: tenant, ultimoMovimientoId: movimiento["id"] });
      const turno = await roundTrip(db, shiftHandovers, { tenantId: tenant });
      await roundTrip(db, handoverCounts, { tenantId: tenant, handoverId: turno["id"] });
      await roundTrip(db, cashDrawerDrops, { tenantId: tenant });
      await roundTrip(db, cashReversals, {
        tenantId: tenant,
        revierteA: movimiento["id"],
        movimientoId: randomUUID(),
      });
      await roundTrip(db, cashAuditLog, { tenantId: tenant, movimientoId: movimiento["id"] });
      await roundTrip(db, cashQrReceipts, { tenantId: tenant, cashMovementId: movimiento["id"] });
      await roundTrip(db, cashDueItems, { tenantId: tenant, cashMovementId: movimiento["id"] });
    });
  });

  describe("inventario", () => {
    it("producto, códigos, fotos, lotes, movimientos, conteos e importación vuelven completos", async () => {
      const db = getTenantDb();
      const ubicacion = await roundTrip(db, locations, { tenantId: tenant });
      const producto = await roundTrip(db, products, {
        tenantId: tenant,
        locationId: ubicacion["id"],
        // CHECK products_sector_check y products_origen_check.
        sector: "general",
        origen: "alta_al_vender",
      });
      const lote = await roundTrip(db, stockLots, { tenantId: tenant, sku: producto["sku"] });
      await roundTrip(db, productCodes, { tenantId: tenant, sku: producto["sku"] });
      await roundTrip(db, productPhotos, { tenantId: tenant, sku: producto["sku"] });
      await roundTrip(db, stockMovements, { tenantId: tenant, sku: producto["sku"], loteId: lote["id"] });
      await roundTrip(db, inventoryCounts, { tenantId: tenant });
      const conteo = await roundTrip(db, stockCounts, { tenantId: tenant });
      await roundTrip(db, stockCountLines, { tenantId: tenant, countId: conteo["id"], sku: producto["sku"] });
      await roundTrip(db, stockImports, { tenantId: tenant });
    });
  });

  describe("fiado", () => {
    it("el cliente y el movimiento de cuenta corriente vuelven completos", async () => {
      const db = getTenantDb();
      const cliente = await roundTrip(db, customers, { tenantId: tenant });
      await roundTrip(db, customerMovements, {
        tenantId: tenant,
        customerId: cliente["id"],
        saleId: randomUUID(),
      });
    });
  });

  describe("fiscal", () => {
    it("settings, secuencias, clientes, comprobante y wizard vuelven completos", async () => {
      const db = getTenantDb();
      await roundTrip(db, fiscalSettings, { tenantId: tenant });
      await roundTrip(db, fiscalSequences, { tenantId: tenant });
      await roundTrip(db, fiscalCustomers, { tenantId: tenant });
      await roundTrip(db, fiscalDocuments, { tenantId: tenant, saleId: randomUUID() });
      await roundTrip(db, fiscalWizard, { tenantId: tenant });
    });
  });

  // Prueba de que el round-trip falla si la base no coincide con el schema: la
  // sonda declara `timestamp` y la tabla real es `timestamp(0)`, así el
  // milisegundo se pierde al releer. La tabla vive en una transacción y se
  // revierte, no queda en la base.
  it("detecta la pérdida de precisión cuando la base no coincide con el schema", async () => {
    const db = getTenantDb();
    const sonda = pgTable("aud_s4_sonda", {
      id: uuid("id").primaryKey(),
      llevadoEn: timestamp("llevado_en").notNull(),
    });
    let error: unknown;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`CREATE TABLE aud_s4_sonda (id uuid PRIMARY KEY, llevado_en timestamp(0) NOT NULL)`);
        await roundTrip(tx, sonda);
        // Si no falla acá, el mensaje no nombra la sonda y el test queda rojo.
        throw new Error("la sonda no detectó la pérdida");
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/aud_s4_sonda/);
  });
});
