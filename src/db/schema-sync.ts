import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// LANE control — Sync offline SYNC-S1/S3/S5 (PRD-SYNC-01, OF3/OF5/OF9).
// Copia durable best-effort de lo que hoy vive en memoria (`store.deviceSync`,
// `control.devices`, `control.offlineGrants`). La fuente de verdad en
// monoproceso sigue siendo la memoria; estas tablas solo agregan durabilidad
// cuando hay CONTROL_DATABASE_URL viva. Nunca bloquean el flujo.
// SYNC-S3/S4 durable: con base viva del tenant, `device_sync_state` es la
// fuente (heartbeat upsert + lectura previa + avisos). `aviso_*_en` marca qué
// nivel ya se notificó para reclamar una sola vez con UPDATE condicional.
export const deviceSyncState = pgTable("device_sync_state", {
  deviceCode: text("device_code").primaryKey(),
  tenantId: text("tenant_id"),
  ultimaVistaEn: timestamp("ultima_vista_en").notNull().defaultNow(),
  pendientes: integer("pendientes").notNull().default(0),
  ultimaOpHlc: text("ultima_op_hlc"),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  aviso24En: timestamp("aviso_24_en"),
  aviso60En: timestamp("aviso_60_en"),
  aviso72En: timestamp("aviso_72_en"),
});

export const syncState = pgTable("sync_state", {
  tenantId: text("tenant_id").notNull(),
  deviceCode: text("device_code").notNull(),
  cursor: text("cursor").notNull().default("0"),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
});

export const offlineGrants = pgTable("offline_grants", {
  grantId: text("grant_id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  tenantId: text("tenant_id").notNull(),
  googleSub: text("google_sub").notNull(),
  deviceCode: text("device_code").notNull(),
  alcance: text("alcance").notNull(),
  expiraEn: timestamp("expira_en").notNull(),
  revocadoEn: timestamp("revocado_en"),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});
