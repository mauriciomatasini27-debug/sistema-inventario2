import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { cashDueItems, cashMovements, cashQrReceipts } from "../../db/schema.js";
import {
  cashAuditLog,
  cashDrawerDrops,
  cashReversals,
  closingSummaries,
  handoverCounts,
  shiftHandovers,
} from "../../db/schema-caja.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { store, type StoredMovement } from "../store.js";
import type { Medio } from "../validation.js";
import { derivar_balance, type Movimiento, type Rol } from "../../modules/cash/caja.js";
import { cerrar_jornada, fecha_jornada_ar, type CierreOk } from "../../modules/cash/cierre.js";
import {
  conciliar_turno,
  registrar_drop,
  resolver_disputa,
  type ConciliarResult,
  type DropResult,
  type ResolverResult,
  type Turno,
} from "../../modules/cash/turnos.js";
import { revertir_movimiento, type ReversionResult } from "../../modules/cash/reversion.js";
import { asegurar_aviso_cierre, type AvisoCierre } from "../../jobs/cierre-medianoche.js";
import { ejecutar_cierre_medianoche, type CierreMedianocheResult } from "../../jobs/cierre-medianoche.js";
import type { SnapshotCaja } from "../../modules/whatsapp/resumen-cierre.js";

// PERS2-S12/S13 (ADR-0056): movimientos, cierres, turnos, retiros,
// reversiones, auditoria, recibos QR y vencimientos de caja. DB primero via
// dbVivaTenant(); solo en single sin base usa la memoria particionada. En
// multi sin base dbVivaTenant lanza BaseNoDisponible y se propaga (503).

type FilaMovimiento = typeof cashMovements.$inferSelect;

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

function esUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

const MEDIOS: Medio[] = ["Efectivo", "Debito", "Mercado Pago", "QR", "Transferencia"];

function filaAMovimientoStore(f: FilaMovimiento): StoredMovement {
  return {
    id: f.id,
    tipo: f.tipo as StoredMovement["tipo"],
    metodo: f.metodo as Medio,
    monto_centavos: f.montoCentavos.toString(),
    origen: f.origen,
    ...(f.saleId !== null ? { sale_id: f.saleId } : {}),
    idempotency_key: f.idempotencyKey,
  };
}

// Balance derivado (C6): SUM por medio desde cash_movements con DB viva,
// memoria particionada solo en single sin base. En multi sin base propaga.
export async function obtenerBalance(): Promise<{ porMedio: Record<string, string>; total: string; fuente: "db" | "memoria" }> {
  const db = dbVivaTenant();
  if (!db) return balanceMemoria();
  try {
    const filas = await db
      .select({ tipo: cashMovements.tipo, metodo: cashMovements.metodo, monto: cashMovements.montoCentavos })
      .from(cashMovements);
    const porMedio = Object.fromEntries(MEDIOS.map((m) => [m, 0n])) as Record<Medio, bigint>;
    let total = 0n;
    for (const f of filas) {
      const v = f.monto;
      if ((MEDIOS as string[]).includes(f.metodo)) porMedio[f.metodo as Medio] += (f.tipo === "ingreso" ? 1n : -1n) * v;
      total += (f.tipo === "ingreso" ? 1n : -1n) * v;
    }
    return {
      porMedio: Object.fromEntries(Object.entries(porMedio).map(([k, v]) => [k, v.toString()])),
      total: total.toString(),
      fuente: "db",
    };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return balanceMemoria();
  }
}

function balanceMemoria(): { porMedio: Record<string, string>; total: string; fuente: "memoria" } {
  const movs = store.movements.map((m) => ({
    tipo: m.tipo,
    metodo: m.metodo,
    monto_centavos: BigInt(m.monto_centavos),
    origen: m.origen as Movimiento["origen"],
  }));
  const b = derivar_balance(movs);
  return {
    porMedio: Object.fromEntries(Object.entries(b.porMedio).map(([k, v]) => [k, v.toString()])),
    total: b.total.toString(),
    fuente: "memoria",
  };
}

// Historial (C11): cash_movements del tenant con DB viva, memoria
// particionada solo en single sin base. En multi sin base propaga.
export async function listarMovimientos(): Promise<StoredMovement[]> {
  const db = dbVivaTenant();
  if (!db) return [...store.movements];
  try {
    const filas = await db
      .select()
      .from(cashMovements)
      .orderBy(asc(cashMovements.createdAt), asc(cashMovements.id));
    return filas.map(filaAMovimientoStore);
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return [...store.movements];
  }
}

function movimientosCierreMemoria(): { movs: Movimiento[]; ultimoId: string | null; enDisputa: number } {
  return {
    movs: store.movements.map((m) => ({
      tipo: m.tipo,
      metodo: m.metodo,
      monto_centavos: BigInt(m.monto_centavos),
      origen: m.origen as Movimiento["origen"],
    })),
    ultimoId: store.movements.length ? (store.movements[store.movements.length - 1]?.id ?? null) : null,
    enDisputa: [...store.turnos.values()].filter((t) => t.estado === "en_disputa").length,
  };
}

async function movimientosCierreEnDb(db: TenantDb): Promise<{ movs: Movimiento[]; ultimoId: string | null; enDisputa: number }> {
  const filas = await db
    .select()
    .from(cashMovements)
    .orderBy(asc(cashMovements.createdAt), asc(cashMovements.id));
  const disputas = await db
    .select({ id: shiftHandovers.id })
    .from(shiftHandovers)
    .where(eq(shiftHandovers.estado, "en_disputa"));
  return {
    movs: filas.map((f) => ({
      tipo: f.tipo as Movimiento["tipo"],
      metodo: f.metodo as Medio,
      monto_centavos: f.montoCentavos,
      origen: f.origen as Movimiento["origen"],
    })),
    ultimoId: filas.length ? (filas[filas.length - 1]?.id ?? null) : null,
    enDisputa: disputas.length,
  };
}

function cierreDesdeFila(f: typeof closingSummaries.$inferSelect): CierreOk {
  return {
    status: 201,
    cierre: {
      fechaJornada: f.fechaJornada,
      closeType: f.closeType as CierreOk["cierre"]["closeType"],
      totalCentavos: f.totalCentavos,
      ultimoMovimientoId: f.ultimoMovimientoId,
    },
  };
}

function snapshotAviso(fechaJornada: string, cierreId: string, total: bigint, porMedio: SnapshotCaja["porMedio"], tipo: SnapshotCaja["tipo"]): SnapshotCaja {
  return { tenantId: "demo", cierreId, fechaJornada, totalCentavos: total, porMedio, tipo, nombreComercio: "Mi comercio" };
}

export type CerrarCajaResultado =
  | { status: 201; cierre: CierreOk["cierre"]; wa: AvisoCierre; fuente: "db" | "memoria" }
  | { status: 409; error: string; original?: CierreOk; wa?: AvisoCierre; fuente: "db" | "memoria" }
  | { status: 422; error: string; fuente: "db" | "memoria" };

// Cierre de jornada (C12 + C10): misma idempotencia que hoy (por key y por
// fecha), cierre en closing_summaries con DB viva y aviso WA idempotente.
// En multi sin base propaga BaseNoDisponible.
export async function cerrarCaja(input: { key: string; fechaJornada: string; closeType: string }): Promise<CerrarCajaResultado> {
  const db = dbVivaTenant();
  if (!db) {
    const mem = movimientosCierreMemoria();
    const r = cerrar_jornada({
      idempotencyKey: input.key,
      fechaJornada: input.fechaJornada,
      closeType: input.closeType,
      movimientos: mem.movs,
      ultimoMovimientoId: mem.ultimoId,
      turnosEnDisputa: mem.enDisputa,
      cierres: store.cierres,
    });
    return conAvisoMemoria(input.key, mem.movs, r, "memoria");
  }
  try {
    const porKey = store.cierres.get(input.key);
    if (porKey) {
      const balance = (await movimientosCierreEnDb(db)).movs;
      const wa = asegurarAviso(store.waEnviados, snapshotAviso(porKey.cierre.fechaJornada, input.key, porKey.cierre.totalCentavos, derivar_balance(balance).porMedio, porKey.cierre.closeType));
      return { status: 409, error: "idempotency-key repetida", original: porKey, wa, fuente: "memoria" };
    }
    if (store.cierres.has(input.fechaJornada)) return { status: 409, error: "jornada ya cerrada", fuente: "memoria" };
    const prevKey = await db.select().from(closingSummaries).where(eq(closingSummaries.idempotencyKey, input.key)).limit(1);
    if (prevKey[0]) {
      const orig = cierreDesdeFila(prevKey[0]);
      store.cierres.set(input.key, orig);
      store.cierres.set(orig.cierre.fechaJornada, orig);
      const balance = (await movimientosCierreEnDb(db)).movs;
      const wa = asegurarAviso(store.waEnviados, snapshotAviso(orig.cierre.fechaJornada, input.key, orig.cierre.totalCentavos, derivar_balance(balance).porMedio, orig.cierre.closeType));
      return { status: 409, error: "idempotency-key repetida", original: orig, wa, fuente: "db" };
    }
    const prevFecha = await db.select().from(closingSummaries).where(eq(closingSummaries.fechaJornada, input.fechaJornada)).limit(1);
    if (prevFecha[0]) return { status: 409, error: "jornada ya cerrada", fuente: "db" };
    const estado = await movimientosCierreEnDb(db);
    const r = cerrar_jornada({
      idempotencyKey: input.key,
      fechaJornada: input.fechaJornada,
      closeType: input.closeType,
      movimientos: estado.movs,
      ultimoMovimientoId: estado.ultimoId,
      turnosEnDisputa: estado.enDisputa,
      cierres: new Map(),
    });
    if (r.status !== 201) return { ...r, fuente: "db" };
    const porMedio = derivar_balance(estado.movs).porMedio;
    await db.insert(closingSummaries).values({
      idempotencyKey: input.key,
      fechaJornada: r.cierre.fechaJornada,
      closeType: r.cierre.closeType,
      totalCentavos: r.cierre.totalCentavos,
      porMedio: Object.fromEntries(Object.entries(porMedio).map(([k, v]) => [k, v.toString()])) as never,
      ultimoMovimientoId: r.cierre.ultimoMovimientoId && esUuid(r.cierre.ultimoMovimientoId) ? r.cierre.ultimoMovimientoId : null,
    });
    store.cierres.set(input.key, r);
    store.cierres.set(r.cierre.fechaJornada, r);
    const wa = asegurarAviso(store.waEnviados, snapshotAviso(r.cierre.fechaJornada, input.key, r.cierre.totalCentavos, porMedio, r.cierre.closeType));
    return { status: 201, cierre: r.cierre, wa, fuente: "db" };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    const mem = movimientosCierreMemoria();
    const r = cerrar_jornada({
      idempotencyKey: input.key,
      fechaJornada: input.fechaJornada,
      closeType: input.closeType,
      movimientos: mem.movs,
      ultimoMovimientoId: mem.ultimoId,
      turnosEnDisputa: mem.enDisputa,
      cierres: store.cierres,
    });
    return conAvisoMemoria(input.key, mem.movs, r, "memoria");
  }
}

function conAvisoMemoria(
  key: string,
  movs: Movimiento[],
  r: ReturnType<typeof cerrar_jornada>,
  fuente: "memoria",
): CerrarCajaResultado {
  if (r.status !== 201) {
    if (r.status === 409 && r.original) {
      const wa = asegurarAviso(store.waEnviados, snapshotAviso(r.original.cierre.fechaJornada, key, r.original.cierre.totalCentavos, derivar_balance(movs).porMedio, r.original.cierre.closeType));
      return { status: 409, error: r.error, original: r.original, wa, fuente };
    }
    return { ...r, fuente };
  }
  const wa = asegurarAviso(store.waEnviados, snapshotAviso(r.cierre.fechaJornada, key, r.cierre.totalCentavos, derivar_balance(movs).porMedio, r.cierre.closeType));
  return { status: 201, cierre: r.cierre, wa, fuente };
}

// waEnviados has no table: el aviso de cierre vive en memoria del repo.
function asegurarAviso(waEnviados: Set<string>, snapshot: SnapshotCaja): AvisoCierre {
  return asegurar_aviso_cierre(waEnviados, snapshot);
}

// Cierre automático de medianoche (PERS2-S18): misma idempotencia por jornada
// que hoy (clave `cierre-auto-fecha`). Con DB viva persiste por cerrarCaja;
// en memoria corre el job puro sobre la partición. En multi sin base propaga.
export async function correrCierreMedianoche(ahora: Date): Promise<CierreMedianocheResult> {
  const fecha = fecha_jornada_ar(ahora);
  const key = `cierre-auto-${fecha}`;
  const db = dbVivaTenant();
  if (!db) {
    const mem = movimientosCierreMemoria();
    return ejecutar_cierre_medianoche({
      ahora,
      movimientos: mem.movs,
      ultimoMovimientoId: mem.ultimoId,
      turnosEnDisputa: mem.enDisputa,
      cierres: store.cierres,
      waEnviados: store.waEnviados,
    });
  }
  try {
    const r = await cerrarCaja({ key, fechaJornada: fecha, closeType: "automatica" });
    if (r.status === 201) {
      return { status: 201, fechaJornada: r.cierre.fechaJornada, totalCentavos: r.cierre.totalCentavos.toString(), wa: r.wa };
    }
    if (r.status === 409 && r.original) {
      return {
        status: 409,
        error: r.error,
        fechaJornada: r.original.cierre.fechaJornada,
        totalCentavos: r.original.cierre.totalCentavos.toString(),
        wa: r.wa ?? { estado: "duplicado", idempotencyKey: key, texto: "" },
      };
    }
    if (r.status === 409) {
      const previo = await leerCierre(fecha);
      if (previo) {
        return {
          status: 409,
          error: r.error,
          fechaJornada: previo.cierre.fechaJornada,
          totalCentavos: previo.cierre.totalCentavos.toString(),
          wa: { estado: "duplicado", idempotencyKey: key, texto: "" },
        };
      }
      return { status: 422, error: r.error };
    }
    return { status: 422, error: r.error };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    const mem = movimientosCierreMemoria();
    return ejecutar_cierre_medianoche({
      ahora,
      movimientos: mem.movs,
      ultimoMovimientoId: mem.ultimoId,
      turnosEnDisputa: mem.enDisputa,
      cierres: store.cierres,
      waEnviados: store.waEnviados,
    });
  }
}

// Lectura del cierre por fecha: closing_summaries con DB viva, memoria
// particionada solo en single sin base. En multi sin base propaga.
export async function leerCierre(fecha: string): Promise<CierreOk | null> {
  const mem = store.cierres.get(fecha);
  const db = dbVivaTenant();
  if (!db) return mem ?? null;
  try {
    if (mem) return mem;
    const filas = await db.select().from(closingSummaries).where(eq(closingSummaries.fechaJornada, fecha)).limit(1);
    if (!filas[0]) return null;
    const orig = cierreDesdeFila(filas[0]);
    store.cierres.set(fecha, orig);
    return orig;
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return mem ?? null;
  }
}

function movimientoReversionMemoria(revierteA: string): Movimiento & { id: string } | null {
  const m = store.movements.find((x) => x.id === revierteA);
  if (!m) return null;
  return { id: m.id, tipo: m.tipo, metodo: m.metodo, monto_centavos: BigInt(m.monto_centavos), origen: m.origen as Movimiento["origen"] };
}

// Reversion con compensatorio (C7): misma idempotencia que hoy (por key y
// revierte_a unico), compensatorio en cash_movements + cash_reversals +
// cash_audit_log con DB viva. En multi sin base propaga.
export async function revertirCaja(input: { key: string; revierteA: string; motivo?: string | undefined; actor: string }): Promise<ReversionResult & { fuente: "db" | "memoria" }> {
  const db = dbVivaTenant();
  if (!db) return { ...revertirMemoria(input), fuente: "memoria" };
  try {
    const visto = store.reversionVistos.get(input.key);
    if (visto) return { status: 409, error: "idempotency-key repetida", original: visto, fuente: "memoria" };
    const prevKey = await db.select().from(cashReversals).where(eq(cashReversals.idempotencyKey, input.key)).limit(1);
    if (prevKey[0]) {
      const orig = await reconstruirReversion(db, prevKey[0].revierteA, prevKey[0].movimientoId, prevKey[0].actor, prevKey[0].motivo);
      if (orig) {
        store.movements.push({
          id: orig.movimiento.id,
          tipo: orig.movimiento.tipo,
          metodo: orig.movimiento.metodo,
          monto_centavos: orig.movimiento.monto_centavos.toString(),
          origen: orig.movimiento.origen,
          idempotency_key: input.key,
        });
        store.reversiones.set(input.revierteA, orig.movimiento.id);
        store.reversionVistos.set(input.key, orig);
        store.auditoria.push(orig.auditoria);
        return { status: 409, error: "idempotency-key repetida", original: orig, fuente: "db" };
      }
      return { status: 409, error: "idempotency-key repetida", fuente: "db" };
    }
    if (!esUuid(input.revierteA)) return { status: 422, error: "revierte_a inexistente", fuente: "db" };
    const yaRevertido = await db.select({ id: cashReversals.id }).from(cashReversals).where(eq(cashReversals.revierteA, input.revierteA)).limit(1);
    if (yaRevertido[0]) return { status: 409, error: "movimiento ya revertido", fuente: "db" };
    const memMov = movimientoReversionMemoria(input.revierteA);
    let original: Movimiento & { id: string } | null = memMov;
    if (!original) {
      const filas = await db.select().from(cashMovements).where(eq(cashMovements.id, input.revierteA)).limit(1);
      const f = filas[0];
      if (!f) return { status: 422, error: "revierte_a inexistente", fuente: "db" };
      original = { id: f.id, tipo: f.tipo as Movimiento["tipo"], metodo: f.metodo as Medio, monto_centavos: f.montoCentavos, origen: f.origen as Movimiento["origen"] };
    }
    const r = revertir_movimiento({
      idempotencyKey: input.key,
      revierteA: input.revierteA,
      ...(input.motivo !== undefined ? { motivo: input.motivo } : {}),
      actor: input.actor,
      movimientos: new Map([[original.id, original]]),
      reversiones: new Map(),
      vistos: new Map(),
      auditoria: [],
    });
    if (r.status !== 201) return { ...r, fuente: "db" };
    const movId = esUuid(input.key) ? input.key : randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(cashMovements).values({
        id: movId,
        saleId: null,
        idempotencyKey: input.key,
        tipo: r.movimiento.tipo,
        metodo: r.movimiento.metodo,
        categoriaId: "reversion",
        origen: r.movimiento.origen,
        montoCentavos: r.movimiento.monto_centavos,
      });
      await tx.insert(cashReversals).values({
        idempotencyKey: input.key,
        revierteA: input.revierteA,
        movimientoId: movId,
        actor: input.actor,
        ...(input.motivo !== undefined ? { motivo: input.motivo } : {}),
      });
      await tx.insert(cashAuditLog).values({
        accion: "reversion",
        movimientoId: movId,
        revierteA: input.revierteA,
        detalle: { motivo: input.motivo ?? null } as never,
        actor: input.actor,
      });
    });
    const ok = {
      status: 201 as const,
      movimiento: { ...r.movimiento, id: movId },
      auditoria: { ...r.auditoria, movimientoId: movId },
    };
    store.movements.push({
      id: movId,
      tipo: ok.movimiento.tipo,
      metodo: ok.movimiento.metodo,
      monto_centavos: ok.movimiento.monto_centavos.toString(),
      origen: ok.movimiento.origen,
      idempotency_key: input.key,
    });
    store.reversiones.set(input.revierteA, movId);
    store.reversionVistos.set(input.key, ok);
    store.auditoria.push(ok.auditoria);
    return { ...ok, fuente: "db" };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return { ...revertirMemoria(input), fuente: "memoria" };
  }
}

function revertirMemoria(input: { key: string; revierteA: string; motivo?: string | undefined; actor: string }): ReversionResult {
  const movs = new Map<string, Movimiento & { id: string }>(
    store.movements.map((m) => [
      m.id,
      { id: m.id, tipo: m.tipo, metodo: m.metodo, monto_centavos: BigInt(m.monto_centavos), origen: m.origen as Movimiento["origen"] },
    ]),
  );
  const r = revertir_movimiento({
    idempotencyKey: input.key,
    revierteA: input.revierteA,
    ...(input.motivo !== undefined ? { motivo: input.motivo } : {}),
    actor: input.actor,
    movimientos: movs,
    reversiones: store.reversiones,
    vistos: store.reversionVistos,
    auditoria: store.auditoria,
  });
  if (r.status !== 201) return r;
  store.movements.push({
    id: r.movimiento.id,
    tipo: r.movimiento.tipo,
    metodo: r.movimiento.metodo,
    monto_centavos: r.movimiento.monto_centavos.toString(),
    origen: r.movimiento.origen,
    idempotency_key: input.key,
  });
  return r;
}

async function reconstruirReversion(
  db: TenantDb,
  revierteA: string,
  movimientoId: string,
  actor: string,
  motivo: string | null,
): Promise<{ status: 201; movimiento: { id: string; tipo: Movimiento["tipo"]; metodo: Medio; monto_centavos: bigint; origen: Movimiento["origen"]; revierteA: string }; auditoria: { accion: "reversion"; movimientoId: string; revierteA: string; actor: string; motivo?: string | undefined } } | null> {
  const filas = await db.select().from(cashMovements).where(eq(cashMovements.id, movimientoId)).limit(1);
  const f = filas[0];
  if (!f) return null;
  return {
    status: 201,
    movimiento: {
      id: f.id,
      tipo: f.tipo as Movimiento["tipo"],
      metodo: f.metodo as Medio,
      monto_centavos: f.montoCentavos,
      origen: f.origen as Movimiento["origen"],
      revierteA,
    },
    auditoria: {
      accion: "reversion",
      movimientoId,
      revierteA,
      actor,
      ...(motivo !== null ? { motivo } : {}),
    },
  };
}

export type AbrirTurnoResultado =
  | { status: 201; turno: Turno; fuente: "db" | "memoria" }
  | { status: 409; error: string; original: { turno_id: string }; fuente: "db" | "memoria" };

// Apertura de turno (C17): misma idempotencia por key que hoy, turno en
// shift_handovers con DB viva. En multi sin base propaga.
export async function abrirTurno(input: { key: string; fechaJornada: string; turno: string; entregadoPor: string; esperadoCentavos: bigint }): Promise<AbrirTurnoResultado> {
  const db = dbVivaTenant();
  if (!db) return { ...abrirTurnoMemoria(input), fuente: "memoria" };
  try {
    const previoId = store.shiftKeys.get(input.key);
    if (previoId) {
      const previo = store.turnos.get(previoId);
      if (previo) return { status: 409, error: "idempotency-key repetida", original: { turno_id: previo.id }, fuente: "memoria" };
    }
    const prev = await db.select().from(shiftHandovers).where(eq(shiftHandovers.idempotencyKey, input.key)).limit(1);
    if (prev[0]) {
      const t = filaATurno(prev[0]);
      store.turnos.set(t.id, t);
      store.shiftKeys.set(input.key, t.id);
      return { status: 409, error: "idempotency-key repetida", original: { turno_id: t.id }, fuente: "db" };
    }
    const turno: Turno = {
      id: randomUUID(),
      fechaJornada: input.fechaJornada,
      turno: input.turno,
      entregadoPor: input.entregadoPor,
      esperadoCentavos: input.esperadoCentavos,
      estado: "pendiente",
    };
    await db.insert(shiftHandovers).values({
      id: turno.id,
      idempotencyKey: input.key,
      fechaJornada: turno.fechaJornada,
      turno: turno.turno,
      entregadoPor: turno.entregadoPor,
      esperadoCentavos: turno.esperadoCentavos,
      estado: "pendiente",
    });
    store.turnos.set(turno.id, turno);
    store.shiftKeys.set(input.key, turno.id);
    return { status: 201, turno, fuente: "db" };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return { ...abrirTurnoMemoria(input), fuente: "memoria" };
  }
}

function abrirTurnoMemoria(input: { key: string; fechaJornada: string; turno: string; entregadoPor: string; esperadoCentavos: bigint }): AbrirTurnoResultado {
  const previoId = store.shiftKeys.get(input.key);
  if (previoId) {
    const previo = store.turnos.get(previoId);
    if (previo) return { status: 409, error: "idempotency-key repetida", original: { turno_id: previo.id }, fuente: "memoria" };
  }
  const turno: Turno = {
    id: randomUUID(),
    fechaJornada: input.fechaJornada,
    turno: input.turno,
    entregadoPor: input.entregadoPor,
    esperadoCentavos: input.esperadoCentavos,
    estado: "pendiente",
  };
  store.turnos.set(turno.id, turno);
  store.shiftKeys.set(input.key, turno.id);
  return { status: 201, turno, fuente: "memoria" };
}

function filaATurno(f: typeof shiftHandovers.$inferSelect): Turno {
  return {
    id: f.id,
    fechaJornada: f.fechaJornada,
    turno: f.turno,
    entregadoPor: f.entregadoPor,
    ...(f.recibidoPor !== null ? { recibidoPor: f.recibidoPor } : {}),
    esperadoCentavos: f.esperadoCentavos,
    ...(f.contadoCentavos !== null ? { contadoCentavos: f.contadoCentavos } : {}),
    ...(f.diferenciaCentavos !== null ? { diferenciaCentavos: f.diferenciaCentavos } : {}),
    estado: f.estado as Turno["estado"],
    ...(f.resolucionNota !== null ? { resolucionNota: f.resolucionNota } : {}),
    ...(f.resueltoPor !== null ? { resueltoPor: f.resueltoPor } : {}),
  };
}

// Conciliacion a ciegas (C17): misma validacion que hoy sobre el turno del
// tenant, conteo en handover_counts con DB viva. En multi sin base propaga.
export async function conciliarCaja(input: {
  key: string;
  turnoId: string;
  contadoCentavos: bigint;
  conteosPorMedio: Array<{ medio: string; montoCentavos: bigint }>;
}): Promise<ConciliarResult & { fuente: "db" | "memoria" }> {
  const db = dbVivaTenant();
  if (!db) {
    return {
      ...conciliar_turno({ idempotencyKey: input.key, turnoId: input.turnoId, contadoCentavos: input.contadoCentavos, conteosPorMedio: input.conteosPorMedio, turnos: store.turnos, vistos: store.turnoVistos }),
      fuente: "memoria",
    };
  }
  try {
    const visto = store.turnoVistos.get(input.key);
    if (visto) return { status: 409, error: "idempotency-key repetida", original: visto, fuente: "memoria" };
    const filas = await db.select().from(shiftHandovers).where(eq(shiftHandovers.id, input.turnoId)).limit(1);
    const fila = filas[0];
    if (!fila) return { status: 404, error: "turno inexistente", fuente: "db" };
    const r = conciliar_turno({
      idempotencyKey: input.key,
      turnoId: input.turnoId,
      contadoCentavos: input.contadoCentavos,
      conteosPorMedio: input.conteosPorMedio,
      turnos: new Map([[fila.id, filaATurno(fila)]]),
      vistos: new Map(),
    });
    if (r.status !== 201) return { ...r, fuente: "db" };
    await db.update(shiftHandovers).set({
      contadoCentavos: r.turno.contadoCentavos ?? null,
      diferenciaCentavos: r.turno.diferenciaCentavos ?? null,
      estado: r.turno.estado,
    }).where(eq(shiftHandovers.id, fila.id));
    await db.insert(handoverCounts).values(
      input.conteosPorMedio.map((c) => ({ handoverId: fila.id, medio: c.medio, montoCentavos: c.montoCentavos })),
    );
    store.turnos.set(r.turno.id, r.turno);
    store.turnoVistos.set(input.key, { status: 201, turno: r.turno });
    return { ...r, fuente: "db" };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return {
      ...conciliar_turno({ idempotencyKey: input.key, turnoId: input.turnoId, contadoCentavos: input.contadoCentavos, conteosPorMedio: input.conteosPorMedio, turnos: store.turnos, vistos: store.turnoVistos }),
      fuente: "memoria",
    };
  }
}

// Resolucion de disputas (C17): solo Dueno, misma validacion que hoy, estado
// en shift_handovers con DB viva. En multi sin base propaga.
export async function resolverCaja(input: { turnoId: string; nota: string; rol: Rol; resueltoPor: string }): Promise<ResolverResult> {
  const db = dbVivaTenant();
  if (!db) {
    return resolver_disputa({ turnoId: input.turnoId, nota: input.nota, rol: input.rol, resueltoPor: input.resueltoPor, turnos: store.turnos });
  }
  try {
    let turno = store.turnos.get(input.turnoId);
    if (!turno) {
      const filas = await db.select().from(shiftHandovers).where(eq(shiftHandovers.id, input.turnoId)).limit(1);
      if (!filas[0]) return { status: 404, error: "turno inexistente" };
      turno = filaATurno(filas[0]);
    }
    const r = resolver_disputa({ turnoId: input.turnoId, nota: input.nota, rol: input.rol, resueltoPor: input.resueltoPor, turnos: new Map([[turno.id, turno]]) });
    if (r.status !== 200) return r;
    await db.update(shiftHandovers).set({ estado: "resuelto", resolucionNota: input.nota, resueltoPor: input.resueltoPor }).where(eq(shiftHandovers.id, turno.id));
    store.turnos.set(r.turno.id, r.turno);
    return r;
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return resolver_disputa({ turnoId: input.turnoId, nota: input.nota, rol: input.rol, resueltoPor: input.resueltoPor, turnos: store.turnos });
  }
}

// Retiro a caja fuerte + conteo sorpresa (C17): misma idempotencia por key
// que hoy, fila en cash_drawer_drops con DB viva. En multi sin base propaga.
export async function registrarRetiro(input: {
  key: string;
  fechaJornada: string;
  montoCentavos: bigint;
  motivo?: string | undefined;
  creadoPor: string;
  sorpresa: boolean;
}): Promise<DropResult & { fuente: "db" | "memoria" }> {
  const db = dbVivaTenant();
  if (!db) return { ...registrarRetiroMemoria(input), fuente: "memoria" };
  try {
    const visto = store.dropVistos.get(input.key);
    if (visto) return { status: 409, error: "idempotency-key repetida", original: visto, fuente: "memoria" };
    const prev = await db.select().from(cashDrawerDrops).where(eq(cashDrawerDrops.idempotencyKey, input.key)).limit(1);
    if (prev[0]) {
      const f = prev[0];
      const ok = {
        status: 201 as const,
        drop: {
          id: f.idempotencyKey,
          fechaJornada: f.fechaJornada,
          montoCentavos: f.montoCentavos,
          ...(f.motivo !== null ? { motivo: f.motivo } : {}),
          creadoPor: f.creadoPor,
          sorpresa: f.sorpresa,
        },
      };
      store.drops.set(ok.drop.id, ok.drop);
      store.dropVistos.set(input.key, ok);
      return { status: 409, error: "idempotency-key repetida", original: ok, fuente: "db" };
    }
    const r = registrar_drop({
      idempotencyKey: input.key,
      fechaJornada: input.fechaJornada,
      montoCentavos: input.montoCentavos,
      ...(input.motivo !== undefined ? { motivo: input.motivo } : {}),
      creadoPor: input.creadoPor,
      sorpresa: input.sorpresa,
      drops: new Map(),
      vistos: new Map(),
    });
    if (r.status !== 201) return { ...r, fuente: "db" };
    await db.insert(cashDrawerDrops).values({
      idempotencyKey: input.key,
      fechaJornada: input.fechaJornada,
      montoCentavos: input.montoCentavos,
      motivo: input.motivo ?? null,
      creadoPor: input.creadoPor,
      sorpresa: input.sorpresa,
    });
    store.drops.set(r.drop.id, r.drop);
    store.dropVistos.set(input.key, { status: 201, drop: r.drop });
    return { ...r, fuente: "db" };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return { ...registrarRetiroMemoria(input), fuente: "memoria" };
  }
}

function registrarRetiroMemoria(input: {
  key: string;
  fechaJornada: string;
  montoCentavos: bigint;
  motivo?: string | undefined;
  creadoPor: string;
  sorpresa: boolean;
}): DropResult {
  return registrar_drop({
    idempotencyKey: input.key,
    fechaJornada: input.fechaJornada,
    montoCentavos: input.montoCentavos,
    ...(input.motivo !== undefined ? { motivo: input.motivo } : {}),
    creadoPor: input.creadoPor,
    sorpresa: input.sorpresa,
    drops: store.drops,
    vistos: store.dropVistos,
  });
}

export interface QrRecibo {
  numeroOperacion: string;
  montoCentavos: string;
  estado: string;
  idemKey: string;
}

function filaAQrRecibo(f: typeof cashQrReceipts.$inferSelect): QrRecibo {
  return { numeroOperacion: f.numeroOperacion, montoCentavos: f.montoCentavos.toString(), estado: f.estado, idemKey: f.idempotencyKey };
}

// QR (CAJA-S1/S2): dedupe por numero_operacion, lista y deshacer. Filas en
// cash_qr_receipts con DB viva, memoria solo en single sin base.
export async function registrarQr(input: { num: string; montoCentavos: number; key: string }): Promise<{ status: 201; recibo: QrRecibo } | { status: 409; error: string; numero_operacion: string }> {
  const db = dbVivaTenant();
  if (!db) return registrarQrMemoria(input);
  try {
    if (store.qrRecibos.has(input.num)) return { status: 409, error: "ya registrado", numero_operacion: input.num };
    const prev = await db.select().from(cashQrReceipts).where(eq(cashQrReceipts.numeroOperacion, input.num)).limit(1);
    if (prev[0]) {
      const recibo = filaAQrRecibo(prev[0]);
      store.qrRecibos.set(input.num, recibo);
      return { status: 409, error: "ya registrado", numero_operacion: input.num };
    }
    const recibo: QrRecibo = { numeroOperacion: input.num, montoCentavos: String(input.montoCentavos), estado: "pendiente", idemKey: input.key };
    await db.insert(cashQrReceipts).values({ numeroOperacion: input.num, montoCentavos: BigInt(input.montoCentavos), idempotencyKey: input.key }).onConflictDoNothing();
    store.qrRecibos.set(input.num, recibo);
    return { status: 201, recibo };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return registrarQrMemoria(input);
  }
}

function registrarQrMemoria(input: { num: string; montoCentavos: number; key: string }): { status: 201; recibo: QrRecibo } | { status: 409; error: string; numero_operacion: string } {
  if (store.qrRecibos.has(input.num)) return { status: 409, error: "ya registrado", numero_operacion: input.num };
  const recibo: QrRecibo = { numeroOperacion: input.num, montoCentavos: String(input.montoCentavos), estado: "pendiente", idemKey: input.key };
  store.qrRecibos.set(input.num, recibo);
  return { status: 201, recibo };
}

export async function listarQr(filtro: string): Promise<QrRecibo[]> {
  const db = dbVivaTenant();
  if (!db) return listarQrMemoria(filtro);
  try {
    const filas = await db.select().from(cashQrReceipts).orderBy(asc(cashQrReceipts.createdAt));
    let lista = filas.map(filaAQrRecibo);
    if (filtro === "sin_comprobante") lista = lista.filter((r) => r.estado === "pendiente");
    for (const r of lista) store.qrRecibos.set(r.numeroOperacion, r);
    return lista;
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return listarQrMemoria(filtro);
  }
}

function listarQrMemoria(filtro: string): QrRecibo[] {
  let lista = [...store.qrRecibos.values()];
  if (filtro === "sin_comprobante") lista = lista.filter((r) => r.estado === "pendiente");
  return lista;
}

export async function deshacerQr(num: string): Promise<{ status: 200; num: string } | { status: 404; error: string } | { status: 409; error: string }> {
  const db = dbVivaTenant();
  if (!db) return deshacerQrMemoria(num);
  try {
    const mem = store.qrRecibos.get(num);
    let estado = mem?.estado;
    if (estado === undefined) {
      const filas = await db.select().from(cashQrReceipts).where(eq(cashQrReceipts.numeroOperacion, num)).limit(1);
      if (!filas[0]) return { status: 404, error: "desconocido" };
      estado = filas[0].estado;
    }
    if (estado !== "pendiente") return { status: 409, error: "no deshace confirmado" };
    await db.delete(cashQrReceipts).where(eq(cashQrReceipts.numeroOperacion, num));
    store.qrRecibos.delete(num);
    return { status: 200, num };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return deshacerQrMemoria(num);
  }
}

function deshacerQrMemoria(num: string): { status: 200; num: string } | { status: 404; error: string } | { status: 409; error: string } {
  const r = store.qrRecibos.get(num);
  if (!r) return { status: 404, error: "desconocido" };
  if (r.estado !== "pendiente") return { status: 409, error: "no deshace confirmado" };
  store.qrRecibos.delete(num);
  return { status: 200, num };
}

export interface VencimientoCaja {
  id: string;
  concepto: string;
  venceEl: string;
  montoCentavos: string;
  estado: string;
}

// Vencimientos (CAJA-S3): filas en cash_due_items con DB viva, memoria solo
// en single sin base. El pago crea el egreso en cash_movements.
export async function listarVencimientos(): Promise<VencimientoCaja[]> {
  const db = dbVivaTenant();
  if (!db) return [...store.vencimientosCaja.values()];
  try {
    const filas = await db.select().from(cashDueItems).orderBy(asc(cashDueItems.createdAt));
    const lista = filas.map((f) => ({ id: f.id, concepto: f.concepto, venceEl: f.venceEl.toISOString(), montoCentavos: f.montoCentavos.toString(), estado: f.estado }));
    for (const d of lista) store.vencimientosCaja.set(d.id, d);
    return lista;
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return [...store.vencimientosCaja.values()];
  }
}

export async function crearVencimiento(input: { concepto: string; venceEl: string; montoCentavos: number }): Promise<VencimientoCaja> {
  const id = randomUUID();
  const d: VencimientoCaja = { id, concepto: input.concepto, venceEl: input.venceEl, montoCentavos: String(input.montoCentavos), estado: "pendiente" };
  const db = dbVivaTenant();
  if (!db) {
    store.vencimientosCaja.set(id, d);
    return d;
  }
  try {
    await db.insert(cashDueItems).values({ id, concepto: d.concepto, venceEl: new Date(d.venceEl), montoCentavos: BigInt(d.montoCentavos), estado: "pendiente" });
    store.vencimientosCaja.set(id, d);
    return d;
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    store.vencimientosCaja.set(id, d);
    return d;
  }
}

export async function pagarVencimiento(input: { id: string; key: string }): Promise<{ status: 200; id: string; egresoId: string } | { status: 404; error: string } | { status: 409; error: string }> {
  const db = dbVivaTenant();
  if (!db) return pagarVencimientoMemoria(input);
  try {
    let d = store.vencimientosCaja.get(input.id);
    if (!d) {
      const filas = await db.select().from(cashDueItems).where(eq(cashDueItems.id, input.id)).limit(1);
      const f = filas[0];
      if (!f) return { status: 404, error: "desconocido" };
      d = { id: f.id, concepto: f.concepto, venceEl: f.venceEl.toISOString(), montoCentavos: f.montoCentavos.toString(), estado: f.estado };
    }
    if (d.estado === "pagada") return { status: 409, error: "ya pagada" };
    const movId = randomUUID();
    const mov = { id: movId, tipo: "egreso" as const, metodo: "Efectivo" as const, monto_centavos: d.montoCentavos, origen: `vencimiento:${input.id}`, idempotency_key: input.key };
    await db.update(cashDueItems).set({ estado: "pagada" }).where(eq(cashDueItems.id, input.id));
    await db.insert(cashMovements).values({
      id: movId,
      saleId: null,
      idempotencyKey: input.key,
      tipo: "egreso",
      metodo: "Efectivo",
      categoriaId: "vencimiento",
      origen: `vencimiento:${input.id}`,
      montoCentavos: BigInt(d.montoCentavos),
    });
    store.vencimientosCaja.set(input.id, { ...d, estado: "pagada" });
    store.movements.push(mov);
    return { status: 200, id: input.id, egresoId: movId };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return pagarVencimientoMemoria(input);
  }
}

function pagarVencimientoMemoria(input: { id: string; key: string }): { status: 200; id: string; egresoId: string } | { status: 404; error: string } | { status: 409; error: string } {
  const d = store.vencimientosCaja.get(input.id);
  if (!d) return { status: 404, error: "desconocido" };
  if (d.estado === "pagada") return { status: 409, error: "ya pagada" };
  d.estado = "pagada";
  store.vencimientosCaja.set(input.id, d);
  const mov = { id: randomUUID(), tipo: "egreso" as const, metodo: "Efectivo" as const, monto_centavos: d.montoCentavos, origen: `vencimiento:${input.id}`, idempotency_key: input.key };
  store.movements.push(mov);
  return { status: 200, id: input.id, egresoId: mov.id };
}

// Egreso manual de pagos a proveedores (PERS2-S14/S15, ADR-0057): lo usan los
// repos de facturas y ordenes en lugar de empujar store.movements. DB primero
// con espejo memoria; en multi sin base propaga BaseNoDisponible.
export async function registrarEgresoRetiro(input: {
  key: string;
  montoCentavos: bigint;
  metodo: Medio;
  origen?: string | undefined;
  categoriaId?: string | undefined;
}): Promise<StoredMovement> {
  const mov: StoredMovement = {
    id: randomUUID(),
    tipo: "egreso",
    metodo: input.metodo,
    monto_centavos: input.montoCentavos.toString(),
    origen: input.origen ?? "retiro",
    idempotency_key: input.key,
  };
  const db = dbVivaTenant();
  if (!db) {
    store.movements.push(mov);
    return mov;
  }
  try {
    await db.insert(cashMovements).values({
      saleId: null,
      idempotencyKey: input.key,
      tipo: "egreso",
      metodo: input.metodo,
      categoriaId: input.categoriaId ?? "pago_proveedor",
      origen: mov.origen,
      montoCentavos: input.montoCentavos,
    });
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
  }
  store.movements.push(mov);
  return mov;
}

// Ingreso de cobro de fiado (PERS2-S17, ADR-0058): lo usa el repo de fiado en
// lugar de empujar store.movements. DB primero con espejo memoria; en multi
// sin base propaga BaseNoDisponible.
export async function registrarIngresoCobro(input: {
  key: string;
  montoCentavos: bigint;
  medio: Medio;
}): Promise<StoredMovement> {
  const mov: StoredMovement = {
    id: randomUUID(),
    tipo: "ingreso",
    metodo: input.medio,
    monto_centavos: input.montoCentavos.toString(),
    origen: "cobro_fiado",
    idempotency_key: input.key,
  };
  const db = dbVivaTenant();
  if (!db) {
    store.movements.push(mov);
    return mov;
  }
  try {
    await db.insert(cashMovements).values({
      saleId: null,
      idempotencyKey: input.key,
      tipo: "ingreso",
      metodo: input.medio,
      categoriaId: "cobro_fiado",
      origen: "cobro_fiado",
      montoCentavos: input.montoCentavos,
    });
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
  }
  store.movements.push(mov);
  return mov;
}
