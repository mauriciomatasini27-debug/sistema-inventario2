import { sql } from "drizzle-orm";
import { bigint, boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// LANE D — Tablas tickets TV4/TV13/TV14 (ADR-0004). P1-83: tenant_id NOT NULL (0048).

export const ticketDiscounts = pgTable("ticket_discounts", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").notNull(),
  lineaIdx: integer("linea_idx").notNull(),
  sku: text("sku").notNull(),
  brutoCentavos: bigint("bruto_centavos", { mode: "bigint" }).notNull(),
  descLineaCentavos: bigint("desc_linea_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  descTicketCentavos: bigint("desc_ticket_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  netoCentavos: bigint("neto_centavos", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const saleReturns = pgTable(
  "sale_returns",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    saleId: uuid("sale_id").notNull(),
    numeroDevolucion: text("numero_devolucion").notNull(),
    montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
    acumuladoPrevioCentavos: bigint("acumulado_previo_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    acumuladoNuevoCentavos: bigint("acumulado_nuevo_centavos", { mode: "bigint" }).notNull(),
    medio: text("medio").notNull(),
    fueAcuenta: boolean("fue_a_cuenta").notNull().default(false),
    motivo: text("motivo").notNull(),
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sale_returns_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    uniqueIndex("sale_returns_tenant_numero_uq").on(t.tenantId, t.numeroDevolucion),
  ],
);

export const ticketPaymentCorrections = pgTable(
  "ticket_payment_corrections",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    saleId: uuid("sale_id").notNull(),
    medioOriginal: text("medio_original").notNull(),
    medioNuevo: text("medio_nuevo").notNull(),
    motivo: text("motivo").notNull(),
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ticket_payment_corrections_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

export const ticketLinks = pgTable(
  "ticket_links",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    saleId: uuid("sale_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiraAt: timestamp("expira_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ticket_links_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

export const ticketLinkRevocations = pgTable(
  "ticket_link_revocations",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    linkId: uuid("link_id").notNull(),
    saleId: uuid("sale_id").notNull(),
    actor: text("actor").notNull(),
    motivo: text("motivo").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ticket_link_revocations_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);
