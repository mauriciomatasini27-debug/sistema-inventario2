import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { DetalleEventoOrden, InstruccionSnapshot } from "../modules/payments/ordenes.js";

// LANE G — payments. P1-83: tenant_id NOT NULL (0048). official_payment_domains sigue global.

export const payees = pgTable("payees", {
  tenantId: uuid("tenant_id").notNull(),
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

export const paymentOrders = pgTable(
  "payment_orders",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    numero: text("numero").notNull(),
    payeeId: uuid("payee_id").notNull(),
    tipo: text("tipo").notNull().default("proveedor"),
    concepto: text("concepto").notNull(),
    categoria: text("categoria").notNull().default("pago_proveedores"),
    montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
    moneda: text("moneda").notNull().default("ARS"),
    venceEl: timestamp("vence_el").notNull(),
    metodoSugerido: text("metodo_sugerido").notNull(),
    instruccionTipo: text("instruccion_tipo").notNull(),
    instruccionSnapshot: jsonb("instruccion_snapshot").$type<InstruccionSnapshot>().notNull(),
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
  },
  (t) => [
    uniqueIndex("payment_orders_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    uniqueIndex("payment_orders_tenant_numero_uq").on(t.tenantId, t.numero),
  ],
);

export const paymentOrderEvents = pgTable("payment_order_events", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  paymentOrderId: uuid("payment_order_id").notNull(),
  deEstado: text("de_estado"),
  aEstado: text("a_estado").notNull(),
  version: integer("version").notNull(),
  actor: text("actor").notNull(),
  origen: text("origen").notNull(),
  detalle: jsonb("detalle").$type<DetalleEventoOrden>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
