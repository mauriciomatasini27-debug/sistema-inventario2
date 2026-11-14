import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Mínimo Slice-0 por ADR-0003/0004. Dinero siempre bigint centavos.
// Inmutables (sales, tickets, cash_movements, outbox) solo INSERT/SELECT:
// el revoke + trigger se aplica en migración, no en este schema tipado.
export const products = pgTable("products", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull().unique(),
  nombre: text("nombre").notNull(),
  precioCentavos: bigint("precio_centavos", { mode: "bigint" }).notNull(),
  stockActual: integer("stock_actual").notNull().default(0),
  // Nivel 1: sector para conteo por sector (default 'general').
  sector: text("sector").notNull().default("general"),
  // PRD-STOCK-01 STOCK-S2 (ADR-0106): origen del producto; NULL en los
  // existentes, "alta_al_vender" al vender y "plantilla_rubro" por plantilla.
  origen: text("origen"),
  // CAT-S5: ubicación del producto (migración 0021, SET NULL al borrar).
  // Referencia perezosa: locations se declara más abajo en este módulo.
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  // ALR-S1: mínimo y cantidad de reposición (migración 0027). NULL = sin
  // mínimo, la alerta usa la rotación 7d (umbral_efectivo).
  minStock: integer("min_stock"),
  reorderQty: integer("reorder_qty"),
});

// Nivel 1: conteos por sector, append-only (inmutable runtime en migración).
export const inventoryCounts = pgTable("inventory_counts", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  sector: text("sector").notNull(),
  idemKey: text("idem_key").notNull().unique(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

export const devices = pgTable("devices", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  deviceCode: text("device_code").notNull().unique(),
  plataforma: text("plataforma").notNull(),
  appVersion: text("app_version").notNull(),
});

// P1-3 PIN de mostrador por dispositivo (migración 0005). Solo hash,
// nunca el plano. El bloqueo es estado local, no secreto.
export const devicePins = pgTable("device_pins", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  deviceCode: text("device_code").primaryKey(),
  pinHash: text("pin_hash").notNull(),
  bloqueado: boolean("bloqueado").notNull().default(false),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
});

export const sales = pgTable("sales", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  medio: text("medio").notNull(),
  totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
  sobreventa: boolean("sobreventa").notNull().default(false),
  offline: boolean("offline").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  clientOccurredAt: timestamp("client_occurred_at").notNull(),
});

export const tickets = pgTable("tickets", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").notNull(),
  definitivo: text("definitivo").unique(),
  provisorio: text("provisorio").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// PERS-S1 (ADR-0024): correlativo de ticket mostrador sin huecos. Una fila
// por mostrador con lock FOR UPDATE dentro de la tx de venta; el rollback
// revierte el incremento. Mismo patrón que fiscal_sequences.
// PERS5-S1 (ADR-0080): la serie `devolucion` numera D-* con el mismo lock.
export const ticketCounters = pgTable("ticket_counters", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: text("id").primaryKey(),
  ultimo: integer("ultimo").notNull().default(0),
});

export const SERIE_MOSTRADOR = "mostrador";
export const SERIE_DEVOLUCION = "devolucion";

export const ticketLines = pgTable("ticket_lines", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").notNull(),
  productId: uuid("product_id").notNull(),
  qty: integer("qty").notNull(),
  precioCentavos: bigint("precio_centavos", { mode: "bigint" }).notNull(),
  // P10-16 GP4: costo congelado del producto al momento de la venta.
  costoCentavos: bigint("costo_centavos", { mode: "bigint" }).notNull().default(sql`0`),
});

export const cashMovements = pgTable("cash_movements", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  saleId: uuid("sale_id"),
  tipo: text("tipo").notNull(),
  metodo: text("metodo").notNull(),
  categoriaId: text("categoria_id").notNull(),
  origen: text("origen").notNull(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OutboxPayload = unknown;

export const outbox = pgTable("outbox", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  opId: uuid("op_id").primaryKey(),
  deviceCode: text("device_code").notNull(),
  deviceSeq: integer("device_seq").notNull(),
  hlc: text("hlc").notNull(),
  modulo: text("modulo").notNull(),
  payload: jsonb("payload").$type<OutboxPayload>().notNull(),
  estado: text("estado").notNull().default("pendiente"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const idMappings = pgTable("id_mappings", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  opId: uuid("op_id").primaryKey(),
  idProvisorio: text("id_provisorio").notNull(),
  idDefinitivo: text("id_definitivo").notNull(),
});

// Control Auth + Onboarding (ADR-0001/0003). Extiende, no reescribe Slice-0.
// Dinero no aplica acá. Todo FK simple sin cascadas destructivas.
export const users = pgTable("users", {
  googleSub: text("google_sub").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  emailVerificado: boolean("email_verificado").notNull().default(false),
  nombre: text("nombre"),
  fotoUrl: text("foto_url"),
  estado: text("estado").notNull().default("activo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  ultimoLoginAt: timestamp("ultimo_login_at"),
});

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombreComercio: varchar("nombre_comercio", { length: 80 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  estado: text("estado").notNull().default("pendiente"),
  plan: text("plan").notNull().default("demo"),
  moneda: varchar("moneda", { length: 3 }).notNull().default("ARS"),
  ownerGoogleSub: text("owner_google_sub").references(() => users.googleSub),
  esDemo: boolean("es_demo").notNull().default(false),
  requestKey: text("request_key"),
  trialHasta: timestamp("trial_hasta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tenantDatabases = pgTable("tenant_databases", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  database: text("database").notNull().unique(),
  estado: text("estado").notNull().default("pendiente"),
  schemaVersion: text("schema_version"),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  googleSub: text("google_sub").references(() => users.googleSub),
  rol: text("rol").notNull().default("empleado"),
  permisos: jsonb("permisos").$type<string[]>().notNull().default([]),
  estado: text("estado").notNull().default("activo"),
  revocadoAt: timestamp("revocado_at"),
  revocadoPor: text("revocado_por"),
  // AU11.3: interruptor "Puede usar el bot" (default activado en el MVP).
  puedeUsarBot: boolean("puede_usar_bot").notNull().default(true),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  email: varchar("email", { length: 320 }).notNull(),
  rol: text("rol").notNull().default("empleado"),
  permisos: jsonb("permisos").$type<string[]>().notNull().default([]),
  estado: text("estado").notNull().default("pendiente"),
  expiraAt: timestamp("expira_at").notNull(),
  creadaPor: text("creada_por"),
  aceptadaPor: text("aceptada_por"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  googleSub: text("google_sub").references(() => users.googleSub),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  expiraAt: timestamp("expira_at").notNull(),
  expiraAbsoluta: timestamp("expira_absoluta"),
  creadoAt: timestamp("creado_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at"),
  revocadaAt: timestamp("revocada_at"),
  motivoRevocacion: text("motivo_revocacion"),
  // AU10.2: última reauth con Google para acciones sensibles.
  reauthAt: timestamp("reauth_at"),
});

export type AuthEventDetalle = Record<string, unknown>;

export const authEvents = pgTable("auth_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  tipo: text("tipo").notNull(),
  actor: text("actor"),
  detalle: jsonb("detalle").$type<AuthEventDetalle>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Tareas fiscales de control con clave texto (delegacion-confirmada).
// Tabla fiscal_jobs del lado control; la cola de aprovisionamiento nunca
// aloja tareas fiscales. Sin cascadas destructivas.
export const fiscalJobs = pgTable("fiscal_jobs", {
  clave: text("clave").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  estado: text("estado").notNull().default("pendiente"),
  intentos: integer("intentos").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Cola mínima de aprovisionamiento (sin pg-boss por ahora).
export const provisionJobs = pgTable("provision_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  estado: text("estado").notNull().default("pendiente"),
  pasoActual: text("paso_actual"),
  intentos: integer("intentos").notNull().default(0),
  error: text("error"),
  requestKey: text("request_key"),
  claimedAt: timestamp("claimed_at"),
  claimedBy: text("claimed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Identidades de WhatsApp solo para revocación en cascada lógica (AU7).
// El VINCULAR/bot queda fuera de corte.
export const whatsappIdentities = pgTable("whatsapp_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  googleSub: text("google_sub").references(() => users.googleSub),
  numero: text("numero"),
  estado: text("estado").notNull().default("pendiente"),
  revocadoAt: timestamp("revocado_at"),
});

// Outbox de señales hacia el panel (solo contadores, nunca negocio).
export type OpsSignalPayload = Record<string, unknown>;

export const opsSignalsOutbox = pgTable("ops_signals_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipo: text("tipo").notNull(),
  payload: jsonb("payload").$type<OpsSignalPayload>().notNull(),
  estado: text("estado").notNull().default("pendiente"),
  claimedAt: timestamp("claimed_at"),
  claimedBy: text("claimed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Núcleo inventario F1-F14 (ADR-0003/0004). Append-only + FEFO.
// Inmutabilidad runtime (REVOKE UPDATE/DELETE + triggers + FOR UPDATE) se
// aplica en migración, no en este schema tipado. Unidades en integer,
// dinero siempre bigint centavos.
export const productCodes = pgTable("product_codes", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  codigo: text("codigo").primaryKey(),
  sku: text("sku")
    .notNull()
    .references(() => products.sku),
  padre: text("padre"),
});

export const stockLots = pgTable("stock_lots", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku")
    .notNull()
    .references(() => products.sku),
  cantidad: integer("cantidad").notNull(),
  cantidadRestante: integer("cantidad_restante").notNull().default(0),
  venceEl: timestamp("vence_el"),
  costoCentavos: bigint("costo_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// PRD-STOCK-01 STOCK-S4 (ADR-0106): el índice parcial único
// stock_movements_stock_inicial_unico (migración 0036) cubre las keys
// 'stock-inicial:%'; drizzle-kit no declara índices parciales acá.
export const stockMovements = pgTable("stock_movements", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  idemKey: text("idem_key").notNull(),
  sku: text("sku").notNull(),
  loteId: uuid("lote_id"),
  delta: integer("delta").notNull(),
  tipo: text("tipo").notNull(),
  motivo: text("motivo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Vive en la base del tenant: sin tenant_id, como stock_movements.
export const stockImports = pgTable("stock_imports", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  idemKey: text("idem_key").notNull().unique(),
  archivoNombre: text("archivo_nombre").notNull(),
  archivoSha256: text("archivo_sha256").notNull(),
  formato: text("formato").notNull(),
  filasTotal: integer("filas_total").notNull(),
  filasImportadas: integer("filas_importadas").notNull(),
  filasNuevas: integer("filas_nuevas").notNull(),
  filasExistentes: integer("filas_existentes").notNull(),
  filasError: integer("filas_error").notNull(),
  movimientos: integer("movimientos").notNull(),
  creadoPor: text("creado_por").notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

// N1 CAT-S1/S5/S6 + CAJA-S1/S3/S4: tablas mínimas para cutover DB.
// Tests/build sin DB usan store en memoria; con DB viva hay write-through.
export const productPhotos = pgTable("product_photos", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull().references(() => products.sku),
  url: text("url").notNull(),
  ancho: integer("ancho").notNull().default(800),
  alto: integer("alto").notNull().default(800),
  bytes: integer("bytes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Unicidad case-insensitive: índice locations_nombre_lower_unique (migración 0017).
export const locations = pgTable("locations", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  archivada: boolean("archivada").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stockCounts = pgTable("stock_counts", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  idemKey: text("idem_key").notNull().unique(),
  sector: text("sector").notNull().default("general"),
  estado: text("estado").notNull().default("en_curso"),
  contadoPor: text("contado_por"),
  confirmadoPor: text("confirmado_por"),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

export const stockCountLines = pgTable("stock_count_lines", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  countId: uuid("count_id").notNull().references(() => stockCounts.id),
  sku: text("sku").notNull(),
  teorico: integer("teorico").notNull().default(0),
  fisico: integer("fisico").notNull().default(0),
});

export const cashQrReceipts = pgTable("cash_qr_receipts", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  numeroOperacion: text("numero_operacion").notNull().unique(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  estado: text("estado").notNull().default("pendiente"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  // CAJA-S1 (migración 0022): fecha del comprobante e ingesta bot|gmail|manual.
  fechaOperacion: timestamp("fecha_operacion"),
  origen: text("origen").notNull().default("manual"),
  // CAJA-S1: movimiento asociado en auto, SET NULL al borrarlo.
  cashMovementId: uuid("cash_movement_id").references(() => cashMovements.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cashDueItems = pgTable("cash_due_items", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  concepto: text("concepto").notNull(),
  venceEl: timestamp("vence_el").notNull(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  estado: text("estado").notNull().default("pendiente"),
  // CAJA-S3 (migración 0023): marca idempotente del aviso a 3d, fecha de
  // pago y movimiento asociado (SET NULL al borrarlo).
  avisadoEl: timestamp("avisado_el"),
  pagadoEl: timestamp("pagado_el"),
  cashMovementId: uuid("cash_movement_id").references(() => cashMovements.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ticketPayments = pgTable("ticket_payments", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").notNull(),
  metodo: text("metodo").notNull(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  cashMovementId: uuid("cash_movement_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// PERS4-S1 (ADR-0079): trabajos y eventos OCR. tenant_id nullable (ADR-0116 C1).
// idempotency_key único = replay de Idempotency-Key. Timestamps explícitos
// (no default en creado/actualizado) porque el dominio ya trae ISO del caller.
export const ocrJobs = pgTable("ocr_jobs", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  origen: text("origen").notNull(),
  bytesRef: text("bytes_ref").notNull(),
  emisor: text("emisor"),
  estado: text("estado").notNull().default("en_cola"),
  borradorId: text("borrador_id"),
  error: text("error"),
  creadoEn: timestamp("creado_en").notNull(),
  actualizadoEn: timestamp("actualizado_en").notNull(),
  recordadoEn: timestamp("recordado_en"),
});

export const ocrEventos = pgTable("ocr_eventos", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  tipo: text("tipo").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

// P1-74: vínculo durable preapproval_id → tenant (serverless sin mapa en proceso).
export const mpPreapprovalTenants = pgTable("mp_preapproval_tenants", {
  preapprovalId: text("preapproval_id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

// P0-5: eventos del webhook de Mercado Pago. tenant_id nullable (ADR-0116 C1).
export const mpWebhookEvents = pgTable("mp_webhook_events", {
  // ADR-0116 C1: nullable; NOT NULL + unique compuesto en cierre.
  tenantId: uuid("tenant_id"),
  clave: text("clave").primaryKey(),
  preapprovalId: text("preapproval_id").notNull(),
  estado: text("estado").notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});
