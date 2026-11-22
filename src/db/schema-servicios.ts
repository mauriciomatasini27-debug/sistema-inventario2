import { sql } from "drizzle-orm";
import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// LANE F — Consumos de Servicios CS1-CS12 (Nivel 2, Compras y gastos).
// Tablas nuevas del módulo utilities. Vive en la DB del tenant (1 DB por
// cliente, ADR-0001); al panel solo salen contadores vía ops_signals_outbox,
// nunca montos ni emails. Dinero siempre bigint centavos.
// Append-only: utility_bills y email_ingestion_log solo INSERT/SELECT (el
// REVOKE UPDATE/DELETE + triggers + CHECK de estados se aplica en migración,
// igual que schema.ts / schema-caja.ts). service_accounts y
// email_ingestion_filters son catálogos editables por el Dueño (UPDATE
// permitido solo sobre alias/medio/debito/activa, nunca sobre identidad).
// Sin FK con cascada: referencias lógicas por uuid/message-id.

// CS8: cuenta = proveedor + número de cuenta/cliente. Anti-duplicado lógico
// (servicio+proveedor+numero_cuenta, o servicio+proveedor+titular sin número)
// en dominio (cuentas.ts); UNIQUE de respaldo en migración.
export const serviceAccounts = pgTable("service_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  // P10-90 (0053): comercio dueño de la fila; null en filas viejas sin dato seguro.
  tenantId: uuid("tenant_id"),
  servicio: text("servicio").notNull(),
  proveedor: text("proveedor").notNull(),
  titular: text("titular").notNull(),
  numeroCuenta: text("numero_cuenta"),
  alias: text("alias"),
  // Día típico de vencimiento 1-31 para ordenar "próximas a vencer".
  vencimientoTipicoDia: integer("vencimiento_tipico_dia"),
  emailOrigen: text("email_origen"),
  medioHabitual: text("medio_habitual"),
  debitoAutomatico: boolean("debito_automatico").notNull().default(false),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// CS4/CS5/CS11: factura confirmada INMUTABLE (período, vencimiento, monto,
// message-id). Solo el estado pendiente->pagada cambia, en la misma tx que
// el egreso/vencimiento de caja (el adaptador lo aplica; acá solo el tipo).
// La "vencida" NO se persiste: se deriva (derivar_estado) para no tener que
// reescribir filas. messageId UNIQUE = idempotencia Gmail (CS9.1).
export const utilityBills = pgTable(
  "utility_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // P10-90 (0053): comercio dueño de la fila; null en filas viejas sin dato seguro.
    tenantId: uuid("tenant_id"),
    accountId: uuid("account_id").notNull(),
    messageId: text("message_id").notNull(),
    periodo: text("periodo").notNull(),
    vencimiento: text("vencimiento").notNull(),
    montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
    estado: text("estado").notNull().default("pendiente"),
    necesitaRevision: boolean("necesita_revision").notNull().default(false),
    // canal = por dónde entró; origen = cómo se extrajo (pdf_digital/ocr/email_respaldo).
    canal: text("canal").notNull().default("manual"),
    gmailAttachmentId: text("gmail_attachment_id"),
    origen: text("origen").notNull(),
    confianza: jsonb("confianza").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("utility_bills_tenant_message_id_unique").on(t.tenantId, t.messageId),
    uniqueIndex("utility_bills_message_id_legacy_unique")
      .on(t.messageId)
      .where(sql`"tenant_id" IS NULL`),
  ],
);

// CS1.4: filtros de ingesta (remitentes + keywords). Solo se procesa lo que
// matchea un filtro activo; lo demás ni se descarga (solo id en el log).
export const emailIngestionFilters = pgTable("email_ingestion_filters", {
  id: uuid("id").primaryKey().defaultRandom(),
  remitente: text("remitente").notNull(),
  servicio: text("servicio"),
  proveedor: text("proveedor"),
  keywords: jsonb("keywords").notNull().default([]),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// CS11.3: auditoría mínima (solo id + dominio + fecha, SIN contenido).
// messageId UNIQUE: un mensaje se loguea/procesa una sola vez (CS9.1).
export const emailIngestionLog = pgTable("email_ingestion_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: text("message_id").notNull().unique(),
  historyId: text("history_id"),
  remitenteDominio: text("remitente_dominio"),
  decision: text("decision").notNull(),
  motivo: text("motivo"),
  filtroId: uuid("filtro_id"),
  accountId: uuid("account_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
