import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { SnapshotPrecios } from "../modules/pricing/precios.js";

// LANE C — Tablas pricing GP1-GP11 (ADR-0004). Mismo estilo que schema.ts.
// Vive en la DB del tenant (GP10: 1 DB por cliente); al panel solo salen
// contadores vía ops_signals_outbox, nunca montos.
// Dinero siempre bigint centavos. Append-only: cost_history y pricing_audit_log
// solo INSERT/SELECT (revoke + trigger en migración, igual que Slice-0).

// GP1/GP5 v1: cada cambio de costo/precio deja fila inmutable con motivo.
export const costHistory = pgTable("cost_history", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull(),
  costoCentavos: bigint("costo_centavos", { mode: "bigint" }).notNull(),
  precioVigenteCentavos: bigint("precio_vigente_centavos", { mode: "bigint" }).notNull(),
  motivo: text("motivo").notNull(),
  creadoPor: text("creado_por").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// GP5: markup por producto + modo (manual prevalece; markup_fijo recalcula).
export const productMarkups = pgTable(
  "product_markups",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull(),
  modo: text("modo").notNull().default("manual"),
  markupBp: integer("markup_bp"),
  precioManualCentavos: bigint("precio_manual_centavos", { mode: "bigint" }),
  updatedAt: timestamp("updated_at"),
  },
  (t) => [uniqueIndex("product_markups_tenant_sku_uq").on(t.tenantId, t.sku)],
);

// GP7: config global de redondeo + topes (solo Dueño online en dominio).
export const priceSettings = pgTable("price_settings", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  pasoCentavos: bigint("paso_centavos", { mode: "bigint" }).notNull().default(sql`1000`),
  direccion: text("direccion").notNull().default("arriba"),
  topeSubaBp: integer("tope_suba_bp").notNull().default(30_000),
  topeBajaBp: integer("tope_baja_bp").notNull().default(9_000),
  actualizadoPor: text("actualizado_por"),
  updatedAt: timestamp("updated_at"),
});

// GP7 overrides por producto (pasan sobre el setting global).
export const priceOverrides = pgTable(
  "price_overrides",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull(),
  pasoCentavos: bigint("paso_centavos", { mode: "bigint" }),
  motivo: text("motivo"),
  creadoPor: text("creado_por"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("price_overrides_tenant_sku_uq").on(t.tenantId, t.sku)],
);

// GP1/GP3: ajustes masivos con vigencia Ahora/Programada + idempotencia.
// 1 tx idempotente por idempotency_key; programados cancelables en dominio.
export const priceAdjustments = pgTable(
  "price_adjustments",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
  direccion: text("direccion").notNull(),
  porcentajeBp: integer("porcentaje_bp").notNull(),
  pasoCentavos: bigint("paso_centavos", { mode: "bigint" }).notNull().default(sql`1000`),
  vigenciaTipo: text("vigencia_tipo").notNull(),
  aplicaEn: timestamp("aplica_en"),
  estado: text("estado").notNull().default("pendiente"),
  confirmado: boolean("confirmado").notNull().default(false),
  creadoPor: text("creado_por").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  aplicadoEn: timestamp("aplicado_en"),
  canceladoEn: timestamp("cancelado_en"),
  },
  (t) => [uniqueIndex("price_adjustments_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

// GP8: auditoría inmutable quién/cuándo/antes/después (job = "sistema").
// Montos viajan como strings dentro del jsonb (JSON no tiene bigint).
export const pricingAuditLog = pgTable("pricing_audit_log", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  ajusteId: uuid("ajuste_id"),
  sku: text("sku"),
  antes: jsonb("antes").$type<SnapshotPrecios>().notNull(),
  despues: jsonb("despues").$type<SnapshotPrecios>().notNull(),
  motivo: text("motivo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
