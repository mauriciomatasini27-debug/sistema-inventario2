import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

export const suppliers = pgTable(
  "suppliers",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    cuit: text("cuit").notNull(),
  nombre: text("nombre").notNull(),
  email: text("email"),
  telefono: text("telefono"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
  },
  (t) => [uniqueIndex("suppliers_tenant_cuit_uq").on(t.tenantId, t.cuit)],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
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
  },
  (t) => [uniqueIndex("purchase_orders_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  tenantId: uuid("tenant_id").notNull(),
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
export const supplierDrafts = pgTable(
  "supplier_drafts",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
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
  },
  (t) => [uniqueIndex("supplier_drafts_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

// Factura INMUTABLE: solo la crea el toque explícito [Confirmar]; jamás la
// crea la ingesta ni el OCR. La corrección posterior es compensatorio
// (tipo nota_credito con compensatoria_de), nunca UPDATE/DELETE.
export const supplierInvoices = pgTable(
  "supplier_invoices",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
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
  },
  (t) => [uniqueIndex("supplier_invoices_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

// Pago a proveedor INMUTABLE. El egreso en caja lo registra la ruta/capa HTTP
// (fuera de este lane) usando categoria_id pago_proveedor; este lane solo
// entrega el descriptor compatible, sin tocar cash/.
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
  facturaId: uuid("factura_id"),
  supplierCuit: text("supplier_cuit").notNull(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  metodo: text("metodo").notNull(),
  categoriaId: text("categoria_id").notNull().default("pago_proveedor"),
  creadoPor: text("creado_por").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("supplier_payments_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

// Matching determinista borrador↔purchase_orders: una fila por OC evaluada,
// append-only, con motivo auditable (proveedor distinto, orden cerrada,
// monto fuera de tolerancia 1%, match).
export const supplierMatchLog = pgTable("supplier_match_log", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  draftId: text("draft_id").notNull(),
  orderId: uuid("order_id").notNull(),
  coincide: boolean("coincide").notNull(),
  motivo: text("motivo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// #68 PROV-durable: el número (o el hash) es global y la fila vive en la base
// del comercio. El CHECK de estado queda en la migración 0042.
export const proveedorContactos = pgTable(
  "proveedor_contactos",
  {
    tenantId: text("tenant_id").notNull(),
    numeroE164: text("numero_e164").notNull(),
    supplierCuit: text("supplier_cuit"),
    estado: text("estado").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("proveedor_contactos_tenant_idx").on(t.tenantId),
    primaryKey({ columns: [t.tenantId, t.numeroE164] }),
  ],
);

export const proveedorInvitaciones = pgTable("proveedor_invitaciones", {
  codigoHash: text("codigo_hash").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  supplierCuit: text("supplier_cuit"),
  expiraEnMs: bigint("expira_en_ms", { mode: "number" }).notNull(),
  usado: boolean("usado").notNull().default(false),
});

export const proveedorCupo = pgTable(
  "proveedor_cupo",
  {
    tenantId: uuid("tenant_id").notNull(),
    numeroE164: text("numero_e164").notNull(),
    marcasMs: jsonb("marcas_ms").$type<number[]>().notNull().default([]),
    aviso: boolean("aviso").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.numeroE164] })],
);
