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

// Integración Google (ADR-0102/0099/0100). Las cuatro tablas se crean en todas
// las bases por el stream único de migraciones; el handle decide qué se usa:
// google_connections, drafts y events por tenant; gmail_watch_routes por control.
// Tokens solo cifrados; el plano vive en memoria y nunca se persiste.

export const googleConnections = pgTable(
  "google_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    tipo: text("tipo").notNull(),
    cuentaEmail: text("cuenta_email").notNull(),
    scopes: text("scopes").array().notNull().default([]),
    refreshTokenCifrado: text("refresh_token_cifrado"),
    refreshTokenIv: text("refresh_token_iv"),
    refreshTokenTag: text("refresh_token_tag"),
    cifradoVersion: integer("cifrado_version").notNull().default(1),
    kmsKeyId: text("kms_key_id"),
    estado: text("estado").notNull().default("activa"),
    ultimoError: text("ultimo_error"),
    consentimientoVersion: text("consentimiento_version").notNull(),
    consentimientoAt: timestamp("consentimiento_at").notNull(),
    consentidoPor: text("consentido_por"),
    gmailHistoryCursor: text("gmail_history_cursor"),
    watchHistoryId: text("watch_history_id"),
    watchExpiraAt: timestamp("watch_expira_at"),
    photosAlbumes: jsonb("photos_albumes").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("google_connections_tenant_tipo_unique").on(t.tenantId, t.tipo)],
);

export const gmailWatchRoutes = pgTable(
  "gmail_watch_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailHmac: text("email_hmac").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gmail_watch_routes_email_hmac_activo_idx")
      .on(t.emailHmac)
      .where(sql`"activo"`),
  ],
);

export const gmailConnectionEvents = pgTable("gmail_connection_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  connectionId: uuid("connection_id").notNull(),
  evento: text("evento").notNull(),
  actor: text("actor"),
  motivo: text("motivo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const emailIngestionDrafts = pgTable(
  "email_ingestion_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    connectionId: uuid("connection_id"),
    messageId: text("message_id").notNull(),
    gmailAttachmentId: text("gmail_attachment_id"),
    accountId: uuid("account_id"),
    canal: text("canal").notNull().default("gmail"),
    periodo: text("periodo"),
    vencimiento: text("vencimiento"),
    montoCentavos: bigint("monto_centavos", { mode: "bigint" }),
    origen: text("origen").notNull(),
    confianza: jsonb("confianza").notNull().default({}),
    estado: text("estado").notNull().default("pendiente"),
    venceEn: timestamp("vence_en").notNull(),
    recordatorioEn: timestamp("recordatorio_en"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_ingestion_drafts_tenant_message_unique").on(
      t.tenantId,
      t.messageId,
    ),
  ],
);

export const gmailIngestionJobs = pgTable(
  "gmail_ingestion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    historyId: text("history_id").notNull(),
    motivo: text("motivo").notNull().default("push"),
    estado: text("estado").notNull().default("pendiente"),
    intentos: integer("intentos").notNull().default(0),
    runAt: timestamp("run_at").notNull().defaultNow(),
    claimedAt: timestamp("claimed_at"),
    ultimoError: text("ultimo_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gmail_ingestion_jobs_connection_history_unique").on(
      t.connectionId,
      t.historyId,
    ),
  ],
);
