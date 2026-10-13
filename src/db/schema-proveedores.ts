import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// LANE E — Tablas Compras y gastos FP1-FP12 (Nivel 2). Mismo estilo que
// schema.ts / schema-caja.ts / schema-precios.ts. Vive en la DB del tenant.
// Dinero siempre bigint centavos.
// Inmutables (supplier_invoices, supplier_payments, supplier_match_log) solo
// INSERT/SELECT: el REVOKE UPDATE/DELETE + triggers se aplica en migración,
// no en este schema tipado. supplier_drafts es la excepción MUTABLE
// (borrador OCR editable, vence 7 días). suppliers y purchase_orders son
// editables en dominio solo mientras la orden está abierta.

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  cuit: text("cuit").notNull().unique(),
  nombre: text("nombre").notNull(),
  email: text("email"),
  telefono: text("telefono"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  supplierCuit: text("supplier_cuit").notNull(),
  estado: text("estado").notNull().default("abierta"),
  totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
  creadoPor: text("creado_por").notNull(),
  // B6.2/B8.6 Bot WA: marca semanal (lista del viernes), origen web|bot y
  // canal de envío email|wa_manual. Defaults web para no romper el flujo web.
  esSemanal: boolean("es_semanal").notNull().default(false),
  origen: text("origen").notNull().default("web"),
  canal: text("canal"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  cerradoEn: timestamp("cerrado_en"),
});

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  sku: text("sku").notNull(),
  qty: integer("qty").notNull(),
  costoCentavos: bigint("costo_centavos", { mode: "bigint" }).notNull(),
});

// Borrador OCR MUTABLE: lo crea la ingesta (foto/PDF), lo edita el comerciante
// por texto, lo confirma (registra factura) o lo descarta. Vence 7 días
// (E5): confirmar/editar/descartar bloqueados, solo lectura. La confianza por
// campo (alta/media/baja) viaja en jsonb; media => mostrar `revisá`.
export const supplierDrafts = pgTable("supplier_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  origen: text("origen").notNull(),
  bytesRef: text("bytes_ref").notNull(),
  cuit: text("cuit"),
  nombreProveedor: text("nombre_proveedor"),
  fechaIso: text("fecha_iso"),
  totalCentavos: bigint("total_centavos", { mode: "bigint" }),
  items: jsonb("items").notNull().default([]),
  confianza: jsonb("confianza").notNull(),
  estado: text("estado").notNull().default("pendiente"),
  fotoPendiente: boolean("foto_pendiente").notNull().default(false),
  facturaId: uuid("factura_id"),
  confirmadoPor: text("confirmado_por"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  venceAt: timestamp("vence_at").notNull(),
});

// Factura INMUTABLE: solo la crea el toque explícito [Confirmar]; jamás la
// crea la ingesta ni el OCR. La corrección posterior es compensatorio
// (tipo nota_credito con compensatoria_de), nunca UPDATE/DELETE.
export const supplierInvoices = pgTable("supplier_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  draftId: uuid("draft_id"),
  supplierCuit: text("supplier_cuit").notNull(),
  nombreProveedor: text("nombre_proveedor"),
  tipo: text("tipo").notNull().default("factura"),
  fechaIso: text("fecha_iso").notNull(),
  totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
  items: jsonb("items").notNull().default([]),
  compensatoriaDe: uuid("compensatoria_de"),
  creadoPor: text("creado_por").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Pago a proveedor INMUTABLE. El egreso en caja lo registra la ruta/capa HTTP
// (fuera de este lane) usando categoria_id pago_proveedor; este lane solo
// entrega el descriptor compatible, sin tocar cash/.
export const supplierPayments = pgTable("supplier_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  facturaId: uuid("factura_id"),
  supplierCuit: text("supplier_cuit").notNull(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  metodo: text("metodo").notNull(),
  categoriaId: text("categoria_id").notNull().default("pago_proveedor"),
  creadoPor: text("creado_por").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Matching determinista borrador↔purchase_orders: una fila por OC evaluada,
// append-only, con motivo auditable (proveedor distinto, orden cerrada,
// monto fuera de tolerancia 1%, match).
export const supplierMatchLog = pgTable("supplier_match_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  draftId: text("draft_id").notNull(),
  orderId: uuid("order_id").notNull(),
  coincide: boolean("coincide").notNull(),
  motivo: text("motivo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
