import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Analytics por comercio (PRD 6.1: una DB por cliente, sin tenant_id).
// Fuente de verdad: stock_movements. Todo lo demás es derivado y
// reconstruible. Inmutabilidad runtime (REVOKE + triggers) en migración.

export const rotationSettings = pgTable("rotation_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ventanaCoberturaDias: integer("ventana_cobertura_dias").notNull().default(28),
  dormidoN: integer("dormido_n").notNull().default(30),
  dormidoX: integer("dormido_x").notNull().default(60),
  coberturaReponerDias: integer("cobertura_reponer_dias").notNull().default(7),
  abcCorteA: integer("abc_corte_a_bp").notNull().default(8000),
  abcCorteB: integer("abc_corte_b_bp").notNull().default(9500),
  abcMinDias: integer("abc_min_dias").notNull().default(30),
  markupMinBp: integer("markup_min_bp").notNull().default(0),
  updatedAt: timestamp("updated_at"),
});

export const productFlags = pgTable("product_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: text("product_id").notNull(),
  flag: text("flag").notNull(),
  detalle: jsonb("detalle"),
  creadoPor: text("creado_por").notNull(),
  origen: text("origen").notNull().default("tablero"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rotationSnapshots = pgTable("rotation_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  desde: text("desde").notNull(),
  hasta: text("hasta").notNull(),
  payload: jsonb("payload").notNull(),
  payloadHash: text("payload_hash").notNull(),
  origen: text("origen").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reportExports = pgTable("report_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  formato: text("formato").notNull(),
  filtros: jsonb("filtros").notNull(),
  estado: text("estado").notNull().default("pendiente"),
  rowCount: integer("row_count"),
  creadoPor: text("creado_por").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const promoIntents = pgTable("promo_intents", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  skus: jsonb("skus").notNull(),
  pct: integer("pct").notNull(),
  estado: text("estado").notNull().default("confirmada"),
  creadoPor: text("creado_por").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
