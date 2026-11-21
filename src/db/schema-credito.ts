import { sql } from "drizzle-orm";
import { bigint, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const customers = pgTable(
  "customers",
  {
    // P1-81 ADR-0116 shared: dueño por fila.
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: varchar("nombre", { length: 80 }).notNull(),
    telefono: text("telefono"),
    dni: text("dni"),
    // Ley 25.326 mínima: ficha acotada, notas 280c, sin más datos personales.
    notas: varchar("notas", { length: 280 }),
    topeCentavos: bigint("tope_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    plazoDias: integer("plazo_dias").notNull().default(30),
    saldoCacheCentavos: bigint("saldo_cache_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_tenant_id_idx").on(t.tenantId)],
);

// Tipos cerrados (FC/ADR-0004): inicial, venta, cobro, devolucion,
// ajuste_debito, ajuste_credito, incobrable, reversion. CHECK en migración.
export const customerMovements = pgTable(
  "customer_movements",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    // PERS-S4 Slice C: text libre porque customer_id es string de contrato
    // (z.string min 1 max 64), no uuid. Migración 0009 con USING.
    customerId: text("customer_id").notNull(),
    tipo: text("tipo").notNull(),
    debeCentavos: bigint("debe_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    haberCentavos: bigint("haber_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    saleId: uuid("sale_id"),
    // Reversión única C7-style: un original, un espejo.
    revierteA: uuid("revierte_a"),
    idempotencyKey: text("idempotency_key").notNull(),
    motivo: varchar("motivo", { length: 280 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    clientOccurredAt: timestamp("client_occurred_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_movements_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    uniqueIndex("customer_movements_tenant_revierte_uq").on(t.tenantId, t.revierteA),
  ],
);