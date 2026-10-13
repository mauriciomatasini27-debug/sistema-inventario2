import { sql } from "drizzle-orm";
import { bigint, boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// LANE D — Tablas tickets TV4/TV13/TV14 (ADR-0004). Mismo estilo que
// schema.ts / schema-caja.ts: dinero siempre bigint centavos, append-only
// (solo INSERT/SELECT; el REVOKE UPDATE/DELETE + triggers + CHECK se aplica
// en migración, no en este schema tipado). Sin FK con cascada: referencias
// lógicas por uuid a sales.id. Vive en la DB del tenant.
// - ticket_discounts: snapshot de descuentos por línea (TV4/GP4).
// - sale_returns: devoluciones con correlativo propio + vínculo a venta (TV13/C14).
// - ticket_payment_corrections: correcciones de medio auditadas (TV14 P1).

// TV4: una fila por línea de ticket con bruto + descuento de línea +
// porción prorrateada del descuento de ticket + neto. Congelado al emitir.
export const ticketDiscounts = pgTable("ticket_discounts", {
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

// TV13/C14: correlativo propio numero_devolucion (D-000001) UNIQUE + sale_id
// (vínculo atómico a la venta). El tope acumulado se controla en dominio con
// FOR UPDATE sobre la venta; acumulado_previo/nuevo quedan registrados para
// auditoría E4. fue_a_cuenta indica crédito Lane B en vez de caja.
export const saleReturns = pgTable("sale_returns", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  saleId: uuid("sale_id").notNull(),
  numeroDevolucion: text("numero_devolucion").notNull().unique(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  acumuladoPrevioCentavos: bigint("acumulado_previo_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  acumuladoNuevoCentavos: bigint("acumulado_nuevo_centavos", { mode: "bigint" }).notNull(),
  medio: text("medio").notNull(),
  fueAcuenta: boolean("fue_a_cuenta").notNull().default(false),
  motivo: text("motivo").notNull(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// TV14 P1: documento vinculado que corrige el medio sin UPDATE sobre la
// venta. antes/despues + motivo + actor = auditoría completa.
export const ticketPaymentCorrections = pgTable("ticket_payment_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  saleId: uuid("sale_id").notNull(),
  medioOriginal: text("medio_original").notNull(),
  medioNuevo: text("medio_nuevo").notNull(),
  motivo: text("motivo").notNull(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// TV9 (8.Ticket salida): link público con token + vencimiento.
// En DB solo va el SHA-256 hex (tokenHash UNIQUE); el plano se muestra una
// sola vez al crear y nunca se loguea. Append-only igual que el resto:
// revocar = INSERT en ticket_link_revocations, nunca UPDATE.
export const ticketLinks = pgTable("ticket_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  saleId: uuid("sale_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiraAt: timestamp("expira_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// TV9: revocación como documento vinculado (nunca UPDATE sobre ticket_links).
// Una fila por link revocado; el estado se deriva (link sin fila = activo).
export const ticketLinkRevocations = pgTable("ticket_link_revocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  linkId: uuid("link_id").notNull(),
  saleId: uuid("sale_id").notNull(),
  actor: text("actor").notNull(),
  motivo: text("motivo").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
