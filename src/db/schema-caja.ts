import { bigint, boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { DetalleReversion } from "../modules/cash/reversion.js";

// LANE A — Caja cierre + turnos + reversión (ADR-0004 C7/C12/C15/C16/C17).
// Tablas nuevas del módulo cash. cash_movements ya vive en schema.ts y NO se
// duplica acá: la reversión enlaza por cash_reversals.revierte_a UNIQUE.
// Dinero siempre bigint centavos. Todo append-only (solo INSERT/SELECT):
// el REVOKE UPDATE/DELETE + triggers + CHECK(close_type) se aplica en
// migración, no en este schema tipado (mismo criterio que schema.ts).
export const cashDays = pgTable(
  "cash_days",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    fechaJornada: text("fecha_jornada").notNull(),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    openedBy: text("opened_by").notNull(),
    estado: text("estado").notNull().default("abierta"),
    ultimoMovimientoId: uuid("ultimo_movimiento_id"),
  },
  (t) => [uniqueIndex("cash_days_tenant_fecha_uq").on(t.tenantId, t.fechaJornada)],
);

export type CajaPorMedio = Record<string, string>;

export const closingSummaries = pgTable(
  "closing_summaries",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    fechaJornada: text("fecha_jornada").notNull(),
    closeType: text("close_type").notNull(),
    totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
    porMedio: jsonb("por_medio").$type<CajaPorMedio>().notNull(),
    ultimoMovimientoId: uuid("ultimo_movimiento_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("closing_summaries_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    uniqueIndex("closing_summaries_tenant_fecha_uq").on(t.tenantId, t.fechaJornada),
  ],
);

export const shiftHandovers = pgTable(
  "shift_handovers",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
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
  },
  (t) => [uniqueIndex("shift_handovers_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

export const handoverCounts = pgTable("handover_counts", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  handoverId: uuid("handover_id")
    .notNull()
    .references(() => shiftHandovers.id),
  medio: text("medio").notNull(),
  montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cashDrawerDrops = pgTable(
  "cash_drawer_drops",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    fechaJornada: text("fecha_jornada").notNull(),
    montoCentavos: bigint("monto_centavos", { mode: "bigint" }).notNull(),
    motivo: text("motivo"),
    creadoPor: text("creado_por").notNull(),
    sorpresa: boolean("sorpresa").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("cash_drawer_drops_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey)],
);

// C7: el compensatorio es una fila normal de cash_movements (tipo opuesto);
// este enlace guarda revierte_a UNIQUE + la entrada de cash_audit_log.
// cash_audit_log va en la misma tabla con accion = "reversion".
export const cashReversals = pgTable(
  "cash_reversals",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    revierteA: uuid("revierte_a").notNull(),
    movimientoId: uuid("movimiento_id").notNull(),
    actor: text("actor").notNull(),
    motivo: text("motivo"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cash_reversals_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    uniqueIndex("cash_reversals_tenant_revierte_uq").on(t.tenantId, t.revierteA),
    uniqueIndex("cash_reversals_tenant_movimiento_uq").on(t.tenantId, t.movimientoId),
  ],
);

export const cashAuditLog = pgTable("cash_audit_log", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  accion: text("accion").notNull(),
  movimientoId: uuid("movimiento_id"),
  revierteA: uuid("revierte_a"),
  detalle: jsonb("detalle").$type<DetalleReversion>(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});