import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ActoAdmin } from "../modules/admin/actos.js";

// Panel Multi-Kiosco solo-gestión (ADR-0006/0011, PA1-PA14).
// Separación dura Ley 25.326: tenant_id es opaco (uuid, SIN references() a
// tenants) para que Drizzle no pueda hacer join accidental y el borrado en
// control no cascadee auditoría. Solo contadores de gestión, nunca negocio
// (ventas, caja, stock, precios, fiados, clientes, empleados, proveedores).
// Append-only (admin_audit_log, billing_ledger_entries: solo INSERT/SELECT):
// el REVOKE UPDATE/DELETE + trigger anti-UPDATE se aplica en migración, no
// en este schema tipado (mismo criterio que schema.ts).
// Dinero siempre bigint centavos.
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorGoogleSub: text("actor_google_sub").notNull(),
  actoKind: text("acto_kind").notNull(),
  tenantId: uuid("tenant_id"),
  detalle: jsonb("detalle").$type<ActoAdmin>().notNull(),
  prevHash: text("prev_hash"),
  hash: text("hash").notNull().unique(),
  origen: text("origen").notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

// Foto agregada por tenant: solo contadores. La verdad sigue en control;
// estadoVisto/plan son caché con actualizadoEn visible en UI.
export const tenantHealthSignals = pgTable("tenant_health_signals", {
  tenantId: uuid("tenant_id").primaryKey(),
  plan: text("plan").notNull(),
  estadoVisto: text("estado_visto").notNull(),
  ticketsHoy: integer("tickets_hoy").notNull().default(0),
  demosPurgadas: integer("demos_purgadas").notNull().default(0),
  cobrosCentavos: bigint("cobros_centavos", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  ultimaSenalEn: timestamp("ultima_senal_en"),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
});

// Cobranza append-only: sin UPDATE/DELETE. La corrección es un asiento nuevo
// con asientoCompensatorioDe apuntando al original.
export const billingLedgerEntries = pgTable("billing_ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  medio: text("medio").notNull(),
  referenciaExterna: text("referencia_externa").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  asientoCompensatorioDe: uuid("asiento_compensatorio_de"),
  creadoPor: text("creado_por").notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

// Políticas de mora por plan (PA7). Seed demo/base/plus; edición solo admin.
export const dunningPolicies = pgTable("dunning_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  plan: text("plan").notNull().unique(),
  diasGracia: integer("dias_gracia").notNull(),
  diasASuspension: integer("dias_a_suspension").notNull(),
  diasABaja: integer("dias_a_baja").notNull(),
  activa: boolean("activa").notNull().default(true),
  actualizadoPor: text("actualizado_por"),
  actualizadoEn: timestamp("actualizado_en"),
});

// El cambio de tenants.estado lo aplica el contexto control consumiendo este
// evento; admin NUNCA hace UPDATE a tenants directo.
export const tenantLifecycleEvents = pgTable("tenant_lifecycle_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  deEstado: text("de_estado").notNull(),
  aEstado: text("a_estado").notNull(),
  motivo: text("motivo").notNull(),
  actor: text("actor").notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

// Overrides matan el default del plan; resolver_flag ignora expirados.
export const tenantFeatureOverrides = pgTable(
  "tenant_feature_overrides",
  {
    tenantId: uuid("tenant_id").notNull(),
    flag: text("flag").notNull(),
    valor: boolean("valor").notNull(),
    motivo: text("motivo").notNull(),
    expiraEn: timestamp("expira_en"),
    creadoPor: text("creado_por"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.flag] })],
);

// OP-S1/S2: admins plataforma + rollouts + uso diario (solo gestión).
export const platformAdmins = pgTable("platform_admins", {
  googleSub: text("google_sub").primaryKey(),
  estado: text("estado").notNull().default("activo"),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

export const migrationRollouts = pgTable("migration_rollouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  estado: text("estado").notNull().default("pendiente"),
  intentos: integer("intentos").notNull().default(0),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

export const tenantDailyUsage = pgTable("tenant_daily_usage", {
  tenantId: uuid("tenant_id").notNull(),
  dia: text("dia").notNull(),
  tickets: integer("tickets").notNull().default(0),
  usoWa: integer("uso_wa").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.tenantId, t.dia] })]);
