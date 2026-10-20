import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./schema.js";

// PRD-PLAN-01 PLAN-S1/S10 + PRD-IA-01 IA-S5 (ADR-0047, ADR-0045).
// Migraciones 0025 (planes/suscripciones/contadores) y 0026 (ai_usage).
// CHECKs, RLS y semilla de EJEMPLO viven en la migración, no acá.
// Dinero siempre bigint centavos.

export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // 'basico' | 'plus' | 'pro'
  nombre: text("nombre").notNull(),
  precioMensualUsdCentavos: bigint("precio_mensual_usd_centavos", { mode: "bigint" }).notNull(),
  ejemplo: boolean("ejemplo").notNull().default(true),
  modulosRubro: text("modulos_rubro").array().notNull().default(sql`'{}'::text[]`),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const planFeatures = pgTable(
  "plan_features",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    incluida: boolean("incluida").notNull(),
    // NULL = sin techo definido.
    cupoMensual: integer("cupo_mensual"),
  },
  (t) => [primaryKey({ name: "plan_features_pk", columns: [t.planId, t.feature] })],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    estado: text("estado").notNull().default("activa"), // 'activa' | 'cancelada'
    desde: timestamp("desde").notNull().defaultNow(),
    hasta: timestamp("hasta"),
    planProgramado: text("plan_programado").references(() => plans.id, { onDelete: "set null" }),
    proveedor: text("proveedor").notNull().default("manual"),
    proveedorRef: text("proveedor_ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_tenant_id_idx").on(t.tenantId),
    uniqueIndex("subscriptions_tenant_activa_uq").on(t.tenantId).where(sql`"estado" = 'activa'`),
  ],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    mes: text("mes").notNull(), // 'AAAA-MM'
    feature: text("feature").notNull(),
    usado: integer("usado").notNull().default(0),
    costoCentavos: bigint("costo_centavos", { mode: "bigint" }).notNull().default(0n),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "usage_counters_pk", columns: [t.tenantId, t.mes, t.feature] })],
);

// IA-S5: una fila por consulta al asistente (RegistroUsoIA cuenta filas).
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    mes: text("mes").notNull(),
    proveedor: text("proveedor"),
    modelo: text("modelo"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costoCentavos: bigint("costo_centavos", { mode: "bigint" }).notNull().default(0n),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ai_usage_tenant_mes_idx").on(t.tenantId, t.mes)],
);

// BOT-S1/S2 (ADR-0039): interruptor por (tenant, módulo), migración 0028.
// Tenant sin filas = todos los módulos prendidos. CHECK y RLS en la migración.
export const tenantBotModules = pgTable(
  "tenant_bot_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    modulo: text("modulo").notNull(),
    activo: boolean("activo").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("tenant_bot_modules_tenant_modulo_unique").on(t.tenantId, t.modulo)],
);

// ON4-SEED/ON4-5: registro de siembra de ubicaciones por plantilla de rubro,
// migración 0032. Una fila por tenant; RLS en la migración.
export const tenantLocationSeeds = pgTable("tenant_location_seeds", {
  tenantId: text("tenant_id").primaryKey(),
  rubro: text("rubro").notNull(),
  plantillaVersion: text("plantilla_version").notNull(),
  cantidad: integer("cantidad").notNull().default(0),
  sembradoAt: timestamp("sembrado_at").notNull().defaultNow(),
});
