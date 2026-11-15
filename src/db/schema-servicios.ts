import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// LANE F — Consumos. P1-83: tenant_id NOT NULL (0048).

export const serviceAccounts = pgTable("service_accounts", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  servicio: text("servicio").notNull(),
  proveedor: text("proveedor").notNull(),
  titular: text("titular").notNull(),
  numeroCuenta: text("numero_cuenta"),
  alias: text("alias"),
  vencimientoTipicoDia: integer("vencimiento_tipico_dia"),
  emailOrigen: text("email_origen"),
  medioHabitual: text("medio_habitual"),
  debitoAutomatico: boolean("debito_automatico").notNull().default(false),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const utilityBills = pgTable(
  "utility_bills",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull(),
    messageId: text("message_id").notNull(),
    periodo: text("periodo").notNull(),
    vencimiento: text("vencimiento").notNull(),
    montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
    estado: text("estado").notNull().default("pendiente"),
    necesitaRevision: boolean("necesita_revision").notNull().default(false),
    canal: text("canal").notNull().default("manual"),
    gmailAttachmentId: text("gmail_attachment_id"),
    origen: text("origen").notNull(),
    confianza: jsonb("confianza").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("utility_bills_tenant_message_uq").on(t.tenantId, t.messageId)],
);

export const emailIngestionFilters = pgTable("email_ingestion_filters", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  remitente: text("remitente").notNull(),
  servicio: text("servicio"),
  proveedor: text("proveedor"),
  keywords: jsonb("keywords").notNull().default([]),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const emailIngestionLog = pgTable(
  "email_ingestion_log",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: text("message_id").notNull(),
    historyId: text("history_id"),
    remitenteDominio: text("remitente_dominio"),
    decision: text("decision").notNull(),
    motivo: text("motivo"),
    filtroId: uuid("filtro_id"),
    accountId: uuid("account_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_ingestion_log_tenant_message_uq").on(t.tenantId, t.messageId)],
);
