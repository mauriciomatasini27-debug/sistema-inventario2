import { bigint, boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { DetalleReversion } from "../modules/cash/reversion.js";

// LANE A — Caja cierre + turnos + reversión (ADR-0004 C7/C12/C15/C16/C17).
// Tablas nuevas del módulo cash. cash_movements ya vive en schema.ts y NO se
// duplica acá: la reversión enlaza por cash_reversals.revierte_a UNIQUE.
// Dinero siempre bigint centavos. Todo append-only (solo INSERT/SELECT):
// el REVOKE UPDATE/DELETE + triggers + CHECK(close_type) se aplica en
// migración, no en este schema tipado (mismo criterio que schema.ts).
export const cashDays = pgTable("cash_days", {
  id: uuid("id").primaryKey().defaultRandom(),
  fechaJornada: text("fecha_jornada").notNull().unique(),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  openedBy: text("opened_by").notNull(),
  estado: text("estado").notNull().default("abierta"),
  ultimoMovimientoId: uuid("ultimo_movimiento_id"),
});

export type CajaPorMedio = Record<string, string>;

export const closingSummaries = pgTable("closing_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  fechaJornada: text("fecha_jornada").notNull().unique(),
  closeType: text("close_type").notNull(),
  totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
  porMedio: jsonb("por_medio").$type<CajaPorMedio>().notNull(),
  ultimoMovimientoId: uuid("ultimo_movimiento_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shiftHandovers = pgTable("shift_handovers", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  fechaJornada: text("fecha_jornada").notNull(),
  turno: text("turno").notNull(),
  entregadoPor: text("entregado_por").notNull(),
  recibidoPor: text("recibido_por"),
  esperadoCentavos: bigint("esperado_centavos", { mode: "bigint" }).notNull(),
  contadoCentavos: bigint("contado_centavos", { mode: "bigint" }),
  diferenciaCentavos: bigint("diferencia_centavos", { mode: "bigint" }),
  estado: text("estado").notNull().default("pendiente"),
  resolucionNota: text("resolucion_nota"),
  resueltoPor: text("resuelto_por"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const handoverCounts = pgTable("handover_counts", {
  id: uuid("id").primaryKey().defaultRandom(),
  handoverId: uuid("handover_id")
    .notNull()
    .references(() => shiftHandovers.id),
  medio: text("medio").notNull(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cashDrawerDrops = pgTable("cash_drawer_drops", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  fechaJornada: text("fecha_jornada").notNull(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  motivo: text("motivo"),
  creadoPor: text("creado_por").notNull(),
  sorpresa: boolean("sorpresa").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// C7: el compensatorio es una fila normal de cash_movements (tipo opuesto);
// este enlace guarda revierte_a UNIQUE + la entrada de cash_audit_log.
// cash_audit_log va en la misma tabla con accion = "reversion".
export const cashReversals = pgTable("cash_reversals", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  revierteA: uuid("revierte_a").notNull().unique(),
  movimientoId: uuid("movimiento_id").notNull().unique(),
  actor: text("actor").notNull(),
  motivo: text("motivo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cashAuditLog = pgTable("cash_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  accion: text("accion").notNull(),
  movimientoId: uuid("movimiento_id"),
  revierteA: uuid("revierte_a"),
  detalle: jsonb("detalle").$type<DetalleReversion>(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
