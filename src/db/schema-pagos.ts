import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// LANE G — Tablas payments OP1-OP13 (ADR-0001 módulo payments). Mismo estilo
// que schema.ts / schema-caja.ts. Viven en la DB del tenant (las órdenes son
// del comercio); la allowlist global vive en la base de control con la misma
// forma (ver officialPaymentDomains).
// Dinero siempre bigint centavos. Append-only: payment_orders solo avanza por
// máquina cerrada (preparada→pagada|cancelada|vencida) y payment_order_events
// + payees_audit solo INSERT/SELECT: el REVOKE UPDATE/DELETE + triggers +
// CHECK(estado) + UNIQUE parcial (una orden activa por respaldo) se aplica en
// migración, no en este schema tipado (mismo criterio que schema.ts).
// OP1: acá NO hay —ni habrá— columnas para credenciales de Mercado Pago,
// homebanking o ARCA (verificado por test: tests/pagos.test.ts).

// OP6: beneficiarios con datos públicos de cobro (alias/CBU/CUIT/link).
export const payees = pgTable("payees", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull().default("proveedor"),
  cuit: text("cuit"),
  numeroCliente: text("numero_cliente"),
  officialDomainId: uuid("official_domain_id"),
  cbu: text("cbu"),
  alias: text("alias"),
  titular: text("titular"),
  cuitTitular: text("cuit_titular"),
  medioPreferido: text("medio_preferido").notNull().default("Transferencia"),
  linkPagoUrl: text("link_pago_url"),
  linkPagoDominio: text("link_pago_dominio"),
  activo: boolean("activo").notNull().default(true),
  datosCobroActualizadosAt: timestamp("datos_cobro_actualizados_at"),
  datosCobroActualizadosPor: text("datos_cobro_actualizados_por"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// OP2: la orden de pago. supplierInvoiceId opaco hasta que exista Lane E;
// cashMovementId apunta al egreso manual de caja (OP9.2).
export const paymentOrders = pgTable("payment_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  numero: text("numero").notNull().unique(),
  payeeId: uuid("payee_id").notNull(),
  tipo: text("tipo").notNull().default("proveedor"),
  concepto: text("concepto").notNull(),
  categoria: text("categoria").notNull().default("pago_proveedores"),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  moneda: text("moneda").notNull().default("ARS"),
  venceEl: timestamp("vence_el").notNull(),
  metodoSugerido: text("metodo_sugerido").notNull(),
  instruccionTipo: text("instruccion_tipo").notNull(),
  // Snapshot inmutable de lo entregado al comerciante (OP6.3/7.2): aunque la
  // ficha cambie después, la auditoría muestra qué datos/link se mandaron.
  instruccionSnapshot: jsonb("instruccion_snapshot").notNull(),
  linkDominio: text("link_dominio"),
  referencia: text("referencia"),
  supplierInvoiceId: text("supplier_invoice_id"),
  servicioId: text("servicio_id"),
  estado: text("estado").notNull().default("preparada"),
  version: integer("version").notNull().default(1),
  cashMovementId: uuid("cash_movement_id"),
  paidAt: timestamp("paid_at"),
  paidAmountCentavos: bigint("paid_amount_centavos", { mode: "bigint" }),
  paidMethod: text("paid_method"),
  nota: text("nota"),
  comprobanteRef: text("comprobante_ref"),
  cancelMotivo: text("cancel_motivo"),
  creadoPor: text("creado_por").notNull(),
  confirmadoPor: text("confirmado_por"),
  enviadoAt: timestamp("enviado_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// OP13: línea de tiempo legible por orden (quién/cuándo/desde dónde).
export const paymentOrderEvents = pgTable("payment_order_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentOrderId: uuid("payment_order_id").notNull(),
  deEstado: text("de_estado"),
  aEstado: text("a_estado").notNull(),
  version: integer("version").notNull(),
  actor: text("actor").notNull(),
  origen: text("origen").notNull(),
  detalle: jsonb("detalle"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 7.3: allowlist de dominios oficiales de pago. Solo dominios verificados a
// mano por la plataforma; ningún link fuera de acá se envía como link.
export const officialPaymentDomains = pgTable("official_payment_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  dominio: text("dominio").notNull().unique(),
  tipo: text("tipo").notNull(),
  entidad: text("entidad").notNull(),
  urlPagoBase: text("url_pago_base"),
  activo: boolean("activo").notNull().default(true),
  verificadoPor: text("verificado_por"),
  verificadoAt: timestamp("verificado_at"),
  notas: text("notas"),
});
