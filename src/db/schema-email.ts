import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ResumenCierrePayload } from "../modules/email/resumen-cierre.js";

// LANE Email — slice mínimo NE4 resumen_cierre (PRD Email NE1/NE4/NE11).
// Núcleo puro en src/modules/email/; acá solo forma Drizzle.
// Todo append-only salvo intentos/estado de outbox (worker con lock por fila
// en migración). Dinero siempre bigint centavos. Sin tracking en plantillas.

// ALR-S2: alerta de stock bajo por tenant+producto+día.
export interface AlertaStockPayload {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly urgente: boolean;
  readonly fecha: string;
}

// NE11/§6.3: evento de dominio con dedupe. Un resumen_cierre por jornada.
export const notificationEvents = pgTable("notification_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  tipo: text("tipo").notNull(),
  version: integer("version").notNull().default(1),
  refTipo: text("ref_tipo"),
  refId: text("ref_id"),
  payload: jsonb("payload").$type<ResumenCierrePayload | AlertaStockPayload>().notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  estado: text("estado").notNull().default("pendiente"),
  procesarDesde: timestamp("procesar_desde"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Receptor por canal. Canal fijo email para el slice (decisión dueña 9/10/2026:
// 3 claves por WA+email, resto email; el slice solo cubre cierre).
export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => notificationEvents.id),
  googleSub: text("google_sub").notNull(),
  canal: text("canal").notNull().default("email"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  estado: text("estado").notNull().default("pendiente"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// NE11: outbox en misma tx que el cierre. html/texto se cifran en el
// adaptador (columna en claro acá solo para tipar el slice).
export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  categoria: text("categoria").notNull().default("cierre"),
  plantilla: text("plantilla").notNull().default("cierre_v1"),
  destinatario: text("destinatario").notNull(),
  asunto: text("asunto").notNull(),
  html: text("html").notNull(),
  texto: text("texto").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  estado: text("estado").notNull().default("pendiente"),
  intentos: integer("intentos").notNull().default(0),
  providerMessageId: text("provider_message_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Webhooks del proveedor, append-only. provider_event_id único.
export const deliveryStatus = pgTable("delivery_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  outboxId: uuid("outbox_id")
    .notNull()
    .references(() => emailOutbox.id),
  evento: text("evento").notNull(),
  providerEventId: text("provider_event_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// NE10/NE11: bajas y rebotes. Se guarda hash, nunca el email plano.
export const emailSuppressions = pgTable("email_suppressions", {
  emailHash: text("email_hash").primaryKey(),
  motivo: text("motivo").notNull(),
  desde: timestamp("desde").notNull().defaultNow(),
  hasta: timestamp("hasta"),
});
