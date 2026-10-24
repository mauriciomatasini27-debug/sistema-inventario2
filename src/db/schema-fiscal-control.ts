import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Control fiscal (ADR-0018 modelo mínimo D8/D3). Base control, no tenant.
// Clave y TA solo *_ciphertext (envoltura KMS); plano solo en memoria servicio.
// Inmutables de auditoría: solo INSERT/SELECT; REVOKE UPDATE/DELETE en migración.
export const fiscalComputers = pgTable("fiscal_computers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ambiente: text("ambiente").notNull(),
  alias: text("alias").notNull(),
  cuitProveedor: text("cuit_proveedor").notNull(),
  certPem: text("cert_pem").notNull(),
  keyCiphertext: text("key_ciphertext").notNull(),
  kmsKeyId: text("kms_key_id").notNull(),
  notAfter: timestamp("not_after"),
});

export const arcaTokens = pgTable("arca_tokens", {
  fiscalComputerId: uuid("fiscal_computer_id").notNull(),
  servicio: text("servicio").notNull().default("wsfe"),
  ambiente: text("ambiente").notNull(),
  tokenCiphertext: text("token_ciphertext").notNull(),
  signCiphertext: text("sign_ciphertext").notNull(),
  expiration: timestamp("expiration").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const tenantFiscalLinks = pgTable("tenant_fiscal_links", {
  tenantId: uuid("tenant_id").notNull(),
  cuit: text("cuit").notNull(),
  ambiente: text("ambiente").notNull(),
  fiscalComputerId: uuid("fiscal_computer_id").notNull(),
  estado: text("estado").notNull().default("delegacion_pendiente_proveedor"),
});

export const fiscalParams = pgTable("fiscal_params", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
});

export const fiscalJobs = pgTable("fiscal_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  fiscalDocumentId: uuid("fiscal_document_id").notNull(),
  estado: text("estado").notNull().default("pendiente"),
  intentos: bigint("intentos", { mode: "number" }).notNull().default(0),
  proximoIntento: timestamp("proximo_intento"),
});

// FE-S21: pedido/respuesta ARCA sin token ni sign. Hoy el archivo vive en memoria
// (`arca-provider`); una tabla inmutable en control quedará para cuando haya migración.
export type FiscalArcaAuditoriaOperacion = "FECAESolicitar" | "FECompUltimoAutorizado" | "FECompConsultar";
