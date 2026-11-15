import { bigint, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { MarcaNoFacturar } from "../lib/store.js";

// Slice fiscal mínimo (ADR-0019). DB del tenant. Dinero bigint centavos.
// Inmutables: solo INSERT/SELECT; REVOKE UPDATE/DELETE + triggers en migración.
export const fiscalSettings = pgTable("fiscal_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  // P1-83 / 0048: uuid NOT NULL (antes text nullable).
  tenantId: uuid("tenant_id").notNull(),
  cuit: text("cuit").notNull(),
  condicionIva: text("condicion_iva").notNull().default("monotributo"),
  puntoVenta: text("punto_venta").notNull(),
  modo: text("modo").notNull().default("automatico"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fiscalSequences = pgTable(
  "fiscal_sequences",
  {
    tenantId: uuid("tenant_id").notNull(),
    puntoVenta: text("punto_venta").notNull(),
    cbteTipo: text("cbte_tipo").notNull(),
    lastNumber: bigint("last_number", { mode: "number" }).notNull().default(0),
    lastCbteFch: text("last_cbte_fch"),
    inFlightDocumentId: uuid("in_flight_document_id"),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.puntoVenta, t.cbteTipo] })],
);

export const fiscalCustomers = pgTable("fiscal_customers", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  docTipo: text("doc_tipo").notNull(),
  docNro: text("doc_nro").notNull(),
  nombre: text("nombre").notNull(),
  domicilio: text("domicilio"),
  condIva: text("cond_iva").notNull().default("5"),
  origen: text("origen").notNull().default("declarado"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fiscalDocuments = pgTable(
  "fiscal_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
  saleId: uuid("sale_id"),
  // P1-83 / 0048: uuid NOT NULL (antes text nullable).
  tenantId: uuid("tenant_id").notNull(),
  cbteTipo: text("cbte_tipo").notNull(),
  ptoVta: text("pto_vta").notNull(),
  cbteNro: bigint("cbte_nro", { mode: "number" }),
  cbteFch: text("cbte_fch").notNull(),
  docTipo: text("doc_tipo").notNull(),
  docNro: bigint("doc_nro", { mode: "bigint" }).notNull(),
  condIvaReceptor: text("cond_iva_receptor").notNull(),
  impTotalCentavos: bigint("imp_total_centavos", { mode: "bigint" }).notNull(),
  // FE-S12 (B): IVA discriminado + alícuota. Null en C.
  impIvaCentavos: bigint("imp_iva_centavos", { mode: "bigint" }),
  alicIvaId: text("alic_iva_id"),
  // FE-S22/S23 (offline): ocurrencia cliente + leyenda + estados de sync.
  clientOcurredAt: timestamp("client_ocurred_at"),
  ventaLeyenda: text("venta_leyenda"),
  estado: text("estado").notNull().default("pendiente"),
  // FE-S20/T3 (bandeja + reintentos): columnas creadas por la migración 0003.
  intentos: bigint("intentos", { mode: "number" }).notNull().default(0),
  proximoIntento: timestamp("proximo_intento"),
  ultimoErrorCodigo: text("ultimo_error_codigo"),
  motivoCastellano: text("motivo_castellano"),
  noFacturar: jsonb("no_facturar").$type<MarcaNoFacturar>(),
  cae: text("cae"),
  caeVto: text("cae_vto"),
  qrPayload: text("qr_payload"),
  request: jsonb("request"),
  response: jsonb("response"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fiscal_documents_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

export const fiscalWizard = pgTable("fiscal_wizard", {
  tenantId: text("tenant_id").primaryKey(),
  paso: integer("paso").notNull().default(0),
  delegacion: text("delegacion").notNull().default("pendiente"),
  pausaEn: integer("pausa_en"),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
});
