import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { cashDueItems, cashMovements, cashQrReceipts } from "../../db/schema.js";
import {
  cashAuditLog,
  cashDrawerDrops,
  cashReversals,
  closingSummaries,
  handoverCounts,
  shiftHandovers,
} from "../../db/schema-caja.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import {
  crearAlmacenCierres,
  crearAlmacenDropVistos,
  crearAlmacenDrops,
  crearAlmacenQrRecibos,
  crearAlmacenReversiones,
  crearAlmacenReversionVistos,
  crearAlmacenShiftKeys,
  crearAlmacenTurnoVistos,
  crearAlmacenTurnos,
  crearAlmacenVencimientosCaja,
  crearConjuntoWaEnviados,
  crearListaAuditoria,
  crearListaMovimientos,
  type AlmacenVivo,
  type ListaAlmacen,
  type QrRecibo,
  type StoredMovement,
  type VencimientoCaja,
} from "./_almacen.js";
import type { Medio } from "../validation.js";
import { asociarQr, type AsociacionQr, type QrCandidato } from "../../modules/cash/qr-asociacion.js";
import { derivar_balance, type Movimiento, type Rol } from "../../modules/cash/caja.js";
import { cerrar_jornada, fecha_jornada_ar, type CierreOk } from "../../modules/cash/cierre.js";
import {
  conciliar_turno,
  registrar_drop,
  resolver_disputa,
  type ConciliarResult,
  type Drop,
  type DropOk,
  type DropResult,
  type ResolverResult,
  type Turno,
} from "../../modules/cash/turnos.js";
import { revertir_movimiento, type AuditEntry, type ReversionOk, type ReversionResult } from "../../modules/cash/reversion.js";
import { asegurar_aviso_cierre, type AvisoCierre } from "../../jobs/cierre-medianoche.js";
import { ejecutar_cierre_medianoche, type CierreMedianocheResult } from "../../jobs/cierre-medianoche.js";
import type { SnapshotCaja } from "../../modules/whatsapp/resumen-cierre.js";

// PERS2-S12/S13 (ADR-0056): movimientos, cierres, turnos, retiros,
// reversiones, auditoria, recibos QR y vencimientos de caja. DB primero via
// dbVivaTenant(); solo en single sin base usa la memoria particionada. En
// multi sin base dbVivaTenant lanza BaseNoDisponible y se propaga (503).

type FilaMovimiento = typeof cashMovements.$inferSelect;

export type { QrRecibo, VencimientoCaja };

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
  const movimientos = crearListaMovimientos();
  const db = dbVivaTenant();
  if (!db) return balanceMemoria(movimientos.listar());
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
    movimientos.anteFalloPersistencia(e);
    return balanceMemoria(movimientos.listar());
  }
}

function balanceMemoria(movsVivos: StoredMovement[]): { porMedio: Record<string, string>; total: string; fuente: "memoria" } {
  const movs = movsVivos.map((m) => ({
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
  const movimientos = crearListaMovimientos();
  const db = dbVivaTenant();
  if (!db) return [...movimientos.listar()];
  try {
    const filas = await db
      .select()
      .from(cashMovements)
      .orderBy(asc(cashMovements.createdAt), asc(cashMovements.id));
    return filas.map(filaAMovimientoStore);
  } catch (e) {
    movimientos.anteFalloPersistencia(e);
    return [...movimientos.listar()];
  }
}

function movimientosCierreMemoria(movsVivos: StoredMovement[], turnosVivos: ReadonlyMap<string, Turno>): { movs: Movimiento[]; ultimoId: string | null; enDisputa: number } {
  return {
    movs: movsVivos.map((m) => ({
      tipo: m.tipo,
      metodo: m.metodo,
      monto_centavos: BigInt(m.monto_centavos),
      origen: m.origen as Movimiento["origen"],
    })),
    ultimoId: movsVivos.length ? (movsVivos[movsVivos.length - 1]?.id ?? null) : null,
    enDisputa: [...turnosVivos.values()].filter((t) => t.estado === "en_disputa").length,
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
  | { status: 201; cierre: CierreOk["cierre"]; wa: AvisoCierre; fuente: "db" | "memoria"; qrSinComprobante: number }
  | { status: 409; error: string; original?: CierreOk; wa?: AvisoCierre; fuente: "db" | "memoria" }
  | { status: 422; error: string; fuente: "db" | "memoria" };

// Cierre de jornada (C12 + C10): misma idempotencia que hoy (por key y por
// fecha), cierre en closing_summaries con DB viva y aviso WA idempotente.
// En multi sin base propaga BaseNoDisponible.
export async function cerrarCaja(input: { key: string; fechaJornada: string; closeType: string }): Promise<CerrarCajaResultado> {
  const cierres = crearAlmacenCierres();
  const wa = crearConjuntoWaEnviados();
  const movimientos = crearListaMovimientos();
  const turnos = crearAlmacenTurnos();
  const db = dbVivaTenant();
  if (!db) {
    const mem = movimientosCierreMemoria(movimientos.listar(), turnos.comoMapaSoloLectura());
    const r = cerrar_jornada({
      idempotencyKey: input.key,
      fechaJornada: input.fechaJornada,
      closeType: input.closeType,
      movimientos: mem.movs,
      ultimoMovimientoId: mem.ultimoId,
      turnosEnDisputa: mem.enDisputa,
      cierres: cierres.mapaVivo(),
    });
    return conAvisoMemoria(wa.vivos(), input.key, mem.movs, r, "memoria");
  }
  // H1 #78: el conteo QR corre fuera del try de persistencia para que su
  // fallo nunca dispare el repliegue a memoria ni duplique el cierre.
  let exito: { cierre: CierreOk["cierre"]; wa: AvisoCierre } | null = null;
  try {
    const porKey = cierres.obtener(input.key);
    if (porKey) {
      const balance = (await movimientosCierreEnDb(db)).movs;
      const aviso = asegurarAviso(wa.vivos(), snapshotAviso(porKey.cierre.fechaJornada, input.key, porKey.cierre.totalCentavos, derivar_balance(balance).porMedio, porKey.cierre.closeType));
      return { status: 409, error: "idempotency-key repetida", original: porKey, wa: aviso, fuente: "memoria" };
    }
    if (cierres.contiene(input.fechaJornada)) return { status: 409, error: "jornada ya cerrada", fuente: "memoria" };
    const prevKey = await db.select().from(closingSummaries).where(eq(closingSummaries.idempotencyKey, input.key)).limit(1);
    if (prevKey[0]) {
      const orig = cierreDesdeFila(prevKey[0]);
      cierres.guardar(input.key, orig);
      cierres.guardar(orig.cierre.fechaJornada, orig);
      const balance = (await movimientosCierreEnDb(db)).movs;
      const aviso = asegurarAviso(wa.vivos(), snapshotAviso(orig.cierre.fechaJornada, input.key, orig.cierre.totalCentavos, derivar_balance(balance).porMedio, orig.cierre.closeType));
      return { status: 409, error: "idempotency-key repetida", original: orig, wa: aviso, fuente: "db" };
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
      porMedio: Object.fromEntries(Object.entries(porMedio).map(([k, v]) => [k, v.toString()])),
      ultimoMovimientoId: r.cierre.ultimoMovimientoId && esUuid(r.cierre.ultimoMovimientoId) ? r.cierre.ultimoMovimientoId : null,
    });
    cierres.guardar(input.key, r);
    cierres.guardar(r.cierre.fechaJornada, r);
    const aviso = asegurarAviso(wa.vivos(), snapshotAviso(r.cierre.fechaJornada, input.key, r.cierre.totalCentavos, porMedio, r.cierre.closeType));
    exito = { cierre: r.cierre, wa: aviso };
  } catch (e) {
    cierres.anteFalloPersistencia(e);
    const mem = movimientosCierreMemoria(movimientos.listar(), turnos.comoMapaSoloLectura());
    const r = cerrar_jornada({
      idempotencyKey: input.key,
      fechaJornada: input.fechaJornada,
      closeType: input.closeType,
      movimientos: mem.movs,
      ultimoMovimientoId: mem.ultimoId,
      turnosEnDisputa: mem.enDisputa,
      cierres: cierres.mapaVivo(),
    });
    return conAvisoMemoria(wa.vivos(), input.key, mem.movs, r, "memoria");
  }
  // Inalcanzable con exito nulo: el catch siempre devuelve o lanza.
  if (exito === null) throw new Error("cierre sin exito");
  return { status: 201, cierre: exito.cierre, wa: exito.wa, fuente: "db", qrSinComprobante: await contarQrSinComprobanteSeguro() };
}

async function conAvisoMemoria(
  waVivos: Set<string>,
  key: string,
  movs: Movimiento[],
  r: ReturnType<typeof cerrar_jornada>,
  fuente: "memoria",
): Promise<CerrarCajaResultado> {
  if (r.status !== 201) {
    if (r.status === 409 && r.original) {
      const wa = asegurarAviso(waVivos, snapshotAviso(r.original.cierre.fechaJornada, key, r.original.cierre.totalCentavos, derivar_balance(movs).porMedio, r.original.cierre.closeType));
      return { status: 409, error: r.error, original: r.original, wa, fuente };
    }
    return { ...r, fuente };
  }
  const wa = asegurarAviso(waVivos, snapshotAviso(r.cierre.fechaJornada, key, r.cierre.totalCentavos, derivar_balance(movs).porMedio, r.cierre.closeType));
  return { status: 201, cierre: r.cierre, wa, fuente, qrSinComprobante: await contarQrSinComprobanteSeguro() };
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
  const cierres = crearAlmacenCierres();
  const wa = crearConjuntoWaEnviados();
  const movimientos = crearListaMovimientos();
  const turnos = crearAlmacenTurnos();
  const db = dbVivaTenant();
  if (!db) {
    const mem = movimientosCierreMemoria(movimientos.listar(), turnos.comoMapaSoloLectura());
    return ejecutar_cierre_medianoche({
      ahora,
      movimientos: mem.movs,
      ultimoMovimientoId: mem.ultimoId,
      turnosEnDisputa: mem.enDisputa,
      cierres: cierres.mapaVivo(),
      waEnviados: wa.vivos(),
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
    cierres.anteFalloPersistencia(e);
    const mem = movimientosCierreMemoria(movimientos.listar(), turnos.comoMapaSoloLectura());
    return ejecutar_cierre_medianoche({
      ahora,
      movimientos: mem.movs,
      ultimoMovimientoId: mem.ultimoId,
      turnosEnDisputa: mem.enDisputa,
      cierres: cierres.mapaVivo(),
      waEnviados: wa.vivos(),
    });
  }
}

// Lectura del cierre por fecha: closing_summaries con DB viva, memoria
// particionada solo en single sin base. En multi sin base propaga.
export async function leerCierre(fecha: string): Promise<CierreOk | null> {
  const cierres = crearAlmacenCierres();
  const mem = cierres.obtener(fecha);
  const db = dbVivaTenant();
  if (!db) return mem ?? null;
  try {
    if (mem) return mem;
    const filas = await db.select().from(closingSummaries).where(eq(closingSummaries.fechaJornada, fecha)).limit(1);
    if (!filas[0]) return null;
    const orig = cierreDesdeFila(filas[0]);
    cierres.guardar(fecha, orig);
    return orig;
  } catch (e) {
    cierres.anteFalloPersistencia(e);
    return mem ?? null;
  }
}

function movimientoReversionMemoria(movsVivos: StoredMovement[], revierteA: string): Movimiento & { id: string } | null {
  const m = movsVivos.find((x) => x.id === revierteA);
  if (!m) return null;
  return { id: m.id, tipo: m.tipo, metodo: m.metodo, monto_centavos: BigInt(m.monto_centavos), origen: m.origen as Movimiento["origen"] };
}

// Reversion con compensatorio (C7): misma idempotencia que hoy (por key y
// revierte_a unico), compensatorio en cash_movements + cash_reversals +
// cash_audit_log con DB viva. En multi sin base propaga.
export async function revertirCaja(input: { key: string; revierteA: string; motivo?: string | undefined; actor: string }): Promise<ReversionResult & { fuente: "db" | "memoria" }> {
  const movimientos = crearListaMovimientos();
  const reversiones = crearAlmacenReversiones();
  const reversionVistos = crearAlmacenReversionVistos();
  const auditoria = crearListaAuditoria();
  const db = dbVivaTenant();
  if (!db) return { ...revertirMemoria(input, movimientos, reversiones, reversionVistos, auditoria), fuente: "memoria" };
  try {
    const visto = reversionVistos.obtener(input.key);
    if (visto) return { status: 409, error: "idempotency-key repetida", original: visto, fuente: "memoria" };
    const prevKey = await db.select().from(cashReversals).where(eq(cashReversals.idempotencyKey, input.key)).limit(1);
    if (prevKey[0]) {
      const orig = await reconstruirReversion(db, prevKey[0].revierteA, prevKey[0].movimientoId, prevKey[0].actor, prevKey[0].motivo);
      if (orig) {
        movimientos.agregar({
          id: orig.movimiento.id,
          tipo: orig.movimiento.tipo,
          metodo: orig.movimiento.metodo,
          monto_centavos: orig.movimiento.monto_centavos.toString(),
          origen: orig.movimiento.origen,
          idempotency_key: input.key,
          ocurrido_en: new Date().toISOString(),
        });
        reversiones.guardar(input.revierteA, orig.movimiento.id);
        reversionVistos.guardar(input.key, orig);
        auditoria.agregar(orig.auditoria);
        return { status: 409, error: "idempotency-key repetida", original: orig, fuente: "db" };
      }
      return { status: 409, error: "idempotency-key repetida", fuente: "db" };
    }
    if (!esUuid(input.revierteA)) return { status: 422, error: "revierte_a inexistente", fuente: "db" };
    const yaRevertido = await db.select({ id: cashReversals.id }).from(cashReversals).where(eq(cashReversals.revierteA, input.revierteA)).limit(1);
    if (yaRevertido[0]) return { status: 409, error: "movimiento ya revertido", fuente: "db" };
    const memMov = movimientoReversionMemoria(movimientos.listar(), input.revierteA);
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
        detalle: { motivo: input.motivo ?? null },
        actor: input.actor,
      });
    });
    const ok = {
      status: 201 as const,
      movimiento: { ...r.movimiento, id: movId },
      auditoria: { ...r.auditoria, movimientoId: movId },
    };
    movimientos.agregar({
      id: movId,
      tipo: ok.movimiento.tipo,
      metodo: ok.movimiento.metodo,
      monto_centavos: ok.movimiento.monto_centavos.toString(),
      origen: ok.movimiento.origen,
      idempotency_key: input.key,
      ocurrido_en: new Date().toISOString(),
    });
    reversiones.guardar(input.revierteA, movId);
    reversionVistos.guardar(input.key, ok);
    auditoria.agregar(ok.auditoria);
    return { ...ok, fuente: "db" };
  } catch (e) {
    reversionVistos.anteFalloPersistencia(e);
    return { ...revertirMemoria(input, movimientos, reversiones, reversionVistos, auditoria), fuente: "memoria" };
  }
}

function revertirMemoria(
  input: { key: string; revierteA: string; motivo?: string | undefined; actor: string },
  movimientos: ListaAlmacen<StoredMovement>,
  reversiones: AlmacenVivo<string>,
  vistos: AlmacenVivo<ReversionOk>,
  auditoriaViva: ListaAlmacen<AuditEntry>,
): ReversionResult {
  const movs = new Map<string, Movimiento & { id: string }>(
    movimientos.listar().map((m) => [
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
    reversiones: reversiones.mapaVivo(),
    vistos: vistos.mapaVivo(),
    auditoria: auditoriaViva.listar(),
  });
  if (r.status !== 201) return r;
  movimientos.agregar({
    id: r.movimiento.id,
    tipo: r.movimiento.tipo,
    metodo: r.movimiento.metodo,
    monto_centavos: r.movimiento.monto_centavos.toString(),
    origen: r.movimiento.origen,
    idempotency_key: input.key,
    ocurrido_en: new Date().toISOString(),
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
  const turnos = crearAlmacenTurnos();
  const shiftKeys = crearAlmacenShiftKeys();
  const db = dbVivaTenant();
  if (!db) return { ...abrirTurnoMemoria(input, turnos, shiftKeys), fuente: "memoria" };
  try {
    const previoId = shiftKeys.obtener(input.key);
    if (previoId) {
      const previo = turnos.obtener(previoId);
      if (previo) return { status: 409, error: "idempotency-key repetida", original: { turno_id: previo.id }, fuente: "memoria" };
    }
    const prev = await db.select().from(shiftHandovers).where(eq(shiftHandovers.idempotencyKey, input.key)).limit(1);
    if (prev[0]) {
      const t = filaATurno(prev[0]);
      turnos.guardar(t.id, t);
      shiftKeys.guardar(input.key, t.id);
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
    turnos.guardar(turno.id, turno);
    shiftKeys.guardar(input.key, turno.id);
    return { status: 201, turno, fuente: "db" };
  } catch (e) {
    turnos.anteFalloPersistencia(e);
    return { ...abrirTurnoMemoria(input, turnos, shiftKeys), fuente: "memoria" };
  }
}

function abrirTurnoMemoria(
  input: { key: string; fechaJornada: string; turno: string; entregadoPor: string; esperadoCentavos: bigint },
  turnos: AlmacenVivo<Turno>,
  shiftKeys: AlmacenVivo<string>,
): AbrirTurnoResultado {
  const previoId = shiftKeys.obtener(input.key);
  if (previoId) {
    const previo = turnos.obtener(previoId);
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
  turnos.guardar(turno.id, turno);
  shiftKeys.guardar(input.key, turno.id);
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
  const turnos = crearAlmacenTurnos();
  const turnoVistos = crearAlmacenTurnoVistos();
  const db = dbVivaTenant();
  if (!db) {
    return {
      ...conciliar_turno({ idempotencyKey: input.key, turnoId: input.turnoId, contadoCentavos: input.contadoCentavos, conteosPorMedio: input.conteosPorMedio, turnos: turnos.mapaVivo(), vistos: turnoVistos.mapaVivo() }),
      fuente: "memoria",
    };
  }
  try {
    const visto = turnoVistos.obtener(input.key);
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
    turnos.guardar(r.turno.id, r.turno);
    turnoVistos.guardar(input.key, { status: 201, turno: r.turno });
    return { ...r, fuente: "db" };
  } catch (e) {
    turnoVistos.anteFalloPersistencia(e);
    return {
      ...conciliar_turno({ idempotencyKey: input.key, turnoId: input.turnoId, contadoCentavos: input.contadoCentavos, conteosPorMedio: input.conteosPorMedio, turnos: turnos.mapaVivo(), vistos: turnoVistos.mapaVivo() }),
      fuente: "memoria",
    };
  }
}

// Resolucion de disputas (C17): solo Dueno, misma validacion que hoy, estado
// en shift_handovers con DB viva. En multi sin base propaga.
export async function resolverCaja(input: { turnoId: string; nota: string; rol: Rol; resueltoPor: string }): Promise<ResolverResult> {
  const turnos = crearAlmacenTurnos();
  const db = dbVivaTenant();
  if (!db) {
    return resolver_disputa({ turnoId: input.turnoId, nota: input.nota, rol: input.rol, resueltoPor: input.resueltoPor, turnos: turnos.mapaVivo() });
  }
  try {
    let turno = turnos.obtener(input.turnoId);
    if (!turno) {
      const filas = await db.select().from(shiftHandovers).where(eq(shiftHandovers.id, input.turnoId)).limit(1);
      if (!filas[0]) return { status: 404, error: "turno inexistente" };
      turno = filaATurno(filas[0]);
    }
    const r = resolver_disputa({ turnoId: input.turnoId, nota: input.nota, rol: input.rol, resueltoPor: input.resueltoPor, turnos: new Map([[turno.id, turno]]) });
    if (r.status !== 200) return r;
    await db.update(shiftHandovers).set({ estado: "resuelto", resolucionNota: input.nota, resueltoPor: input.resueltoPor }).where(eq(shiftHandovers.id, turno.id));
    turnos.guardar(r.turno.id, r.turno);
    return r;
  } catch (e) {
    turnos.anteFalloPersistencia(e);
    return resolver_disputa({ turnoId: input.turnoId, nota: input.nota, rol: input.rol, resueltoPor: input.resueltoPor, turnos: turnos.mapaVivo() });
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
  const drops = crearAlmacenDrops();
  const dropVistos = crearAlmacenDropVistos();
  const db = dbVivaTenant();
  if (!db) return { ...registrarRetiroMemoria(input, drops, dropVistos), fuente: "memoria" };
  try {
    const visto = dropVistos.obtener(input.key);
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
      drops.guardar(ok.drop.id, ok.drop);
      dropVistos.guardar(input.key, ok);
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
    drops.guardar(r.drop.id, r.drop);
    dropVistos.guardar(input.key, { status: 201, drop: r.drop });
    return { ...r, fuente: "db" };
  } catch (e) {
    drops.anteFalloPersistencia(e);
    return { ...registrarRetiroMemoria(input, drops, dropVistos), fuente: "memoria" };
  }
}

function registrarRetiroMemoria(input: {
  key: string;
  fechaJornada: string;
  montoCentavos: bigint;
  motivo?: string | undefined;
  creadoPor: string;
  sorpresa: boolean;
}, drops: AlmacenVivo<Drop>, vistos: AlmacenVivo<DropOk>): DropResult {
  return registrar_drop({
    idempotencyKey: input.key,
    fechaJornada: input.fechaJornada,
    montoCentavos: input.montoCentavos,
    ...(input.motivo !== undefined ? { motivo: input.motivo } : {}),
    creadoPor: input.creadoPor,
    sorpresa: input.sorpresa,
    drops: drops.mapaVivo(),
    vistos: vistos.mapaVivo(),
  });
}

// QR (CAJA-S1/S2): dedupe por numero_operacion, lista y deshacer. Filas en
// cash_qr_receipts con DB viva, memoria solo en single sin base. Con
// fecha_operacion corre la asociación monto exacto ±15 min (auto si un solo
// candidato, si no toque); Deshacer desvincula el auto a pendiente.
export type QrOrigen = "bot" | "gmail" | "manual";

function filaAQrRecibo(f: typeof cashQrReceipts.$inferSelect): QrRecibo {
  return {
    numeroOperacion: f.numeroOperacion,
    montoCentavos: f.montoCentavos.toString(),
    estado: f.estado,
    idemKey: f.idempotencyKey,
    ...(f.fechaOperacion ? { fechaOperacion: f.fechaOperacion.toISOString() } : {}),
    ...(f.origen ? { origen: f.origen } : {}),
    ...(f.cashMovementId ? { cashMovementId: f.cashMovementId } : {}),
  };
}

export interface RegistrarQrInput {
  num: string;
  montoCentavos: number;
  key: string;
  fechaOperacion?: string | undefined;
  origen?: QrOrigen | undefined;
}

export type RegistrarQrResult =
  | { status: 201; recibo: QrRecibo; asociacion?: AsociacionQr | undefined }
  | { status: 409; error: string; numero_operacion: string };

// Movimientos QR sin comprobante asociado, para el matcher. Con DB viva lee
// createdAt como ocurrido_en; en memoria usa el ocurrido_en del espejo.
async function candidatosQrSinComprobante(db: TenantDb | null, vinculadosMemoria: Set<string>): Promise<QrCandidato[]> {
  if (db) {
    const movs = await db
      .select({ id: cashMovements.id, monto: cashMovements.montoCentavos, creado: cashMovements.createdAt })
      .from(cashMovements)
      .where(eq(cashMovements.metodo, "QR"));
    const vinculados = await db
      .select({ id: cashQrReceipts.cashMovementId })
      .from(cashQrReceipts)
      .where(and(ne(cashQrReceipts.estado, "pendiente"), isNotNull(cashQrReceipts.cashMovementId)));
    const usados = new Set(vinculados.map((v) => v.id).filter((v): v is string => v !== null));
    return movs
      .filter((m) => !usados.has(m.id))
      .map((m) => ({ id: m.id, monto_centavos: m.monto.toString(), ocurrido_en: m.creado.toISOString() }));
  }
  return crearListaMovimientos()
    .listar()
    .filter((m) => m.metodo === "QR" && !vinculadosMemoria.has(m.id) && m.ocurrido_en !== undefined)
    .map((m) => ({ id: m.id, monto_centavos: m.monto_centavos, ocurrido_en: m.ocurrido_en as string }));
}

function vinculadosMemoria(qrRecibos: AlmacenVivo<QrRecibo>): Set<string> {
  const usados = new Set<string>();
  for (const r of qrRecibos.comoMapaSoloLectura().values()) {
    if (r.estado !== "pendiente" && r.cashMovementId) usados.add(r.cashMovementId);
  }
  return usados;
}

// QR (CAJA-S1/S2): dedupe por numero_operacion, lista y deshacer. Filas en
// cash_qr_receipts con DB viva, memoria solo en single sin base.
export async function registrarQr(input: RegistrarQrInput): Promise<RegistrarQrResult> {
  const qrRecibos = crearAlmacenQrRecibos();
  const db = dbVivaTenant();
  if (!db) return registrarQrMemoria(input, qrRecibos);
  try {
    if (qrRecibos.contiene(input.num)) return { status: 409, error: "ya registrado", numero_operacion: input.num };
    const prev = await db.select().from(cashQrReceipts).where(eq(cashQrReceipts.numeroOperacion, input.num)).limit(1);
    if (prev[0]) {
      const recibo = filaAQrRecibo(prev[0]);
      qrRecibos.guardar(input.num, recibo);
      return { status: 409, error: "ya registrado", numero_operacion: input.num };
    }
    const origen = input.origen ?? "manual";
    let recibo: QrRecibo = {
      numeroOperacion: input.num,
      montoCentavos: String(input.montoCentavos),
      estado: "pendiente",
      idemKey: input.key,
      ...(input.fechaOperacion !== undefined ? { fechaOperacion: input.fechaOperacion } : {}),
      origen,
    };
    let asociacion: AsociacionQr | undefined;
    if (input.fechaOperacion !== undefined) {
      const candidatos = await candidatosQrSinComprobante(db, vinculadosMemoria(qrRecibos));
      asociacion = asociarQr({ monto_centavos: input.montoCentavos, fecha_operacion: input.fechaOperacion }, candidatos);
      if (asociacion.tipo === "auto") recibo = { ...recibo, estado: "asociado", cashMovementId: asociacion.movimiento_id };
    }
    await db
      .insert(cashQrReceipts)
      .values({
        numeroOperacion: input.num,
        montoCentavos: BigInt(input.montoCentavos),
        estado: recibo.estado,
        idempotencyKey: input.key,
        ...(input.fechaOperacion !== undefined ? { fechaOperacion: new Date(input.fechaOperacion) } : {}),
        origen,
        ...(recibo.cashMovementId ? { cashMovementId: recibo.cashMovementId } : {}),
      })
      .onConflictDoNothing();
    qrRecibos.guardar(input.num, recibo);
    return { status: 201, recibo, ...(asociacion !== undefined ? { asociacion } : {}) };
  } catch (e) {
    qrRecibos.anteFalloPersistencia(e);
    return registrarQrMemoria(input, qrRecibos);
  }
}

async function registrarQrMemoria(
  input: RegistrarQrInput,
  qrRecibos: AlmacenVivo<QrRecibo>,
): Promise<RegistrarQrResult> {
  if (qrRecibos.contiene(input.num)) return { status: 409, error: "ya registrado", numero_operacion: input.num };
  const origen = input.origen ?? "manual";
  let recibo: QrRecibo = {
    numeroOperacion: input.num,
    montoCentavos: String(input.montoCentavos),
    estado: "pendiente",
    idemKey: input.key,
    ...(input.fechaOperacion !== undefined ? { fechaOperacion: input.fechaOperacion } : {}),
    origen,
  };
  let asociacion: AsociacionQr | undefined;
  if (input.fechaOperacion !== undefined) {
    const candidatos = await candidatosQrSinComprobante(null, vinculadosMemoria(qrRecibos));
    asociacion = asociarQr({ monto_centavos: input.montoCentavos, fecha_operacion: input.fechaOperacion }, candidatos);
    if (asociacion.tipo === "auto") recibo = { ...recibo, estado: "asociado", cashMovementId: asociacion.movimiento_id };
  }
  qrRecibos.guardar(input.num, recibo);
  return { status: 201, recibo, ...(asociacion !== undefined ? { asociacion } : {}) };
}

export async function listarQr(filtro: string): Promise<QrRecibo[]> {
  const qrRecibos = crearAlmacenQrRecibos();
  const db = dbVivaTenant();
  if (!db) return listarQrMemoria(filtro, qrRecibos);
  try {
    const filas = await db.select().from(cashQrReceipts).orderBy(asc(cashQrReceipts.createdAt));
    let lista = filas.map(filaAQrRecibo);
    if (filtro === "sin_comprobante") lista = lista.filter((r) => r.estado === "pendiente");
    for (const r of lista) qrRecibos.guardar(r.numeroOperacion, r);
    return lista;
  } catch (e) {
    qrRecibos.anteFalloPersistencia(e);
    return listarQrMemoria(filtro, qrRecibos);
  }
}

function listarQrMemoria(filtro: string, qrRecibos: AlmacenVivo<QrRecibo>): QrRecibo[] {
  let lista = [...qrRecibos.comoMapaSoloLectura().values()];
  if (filtro === "sin_comprobante") lista = lista.filter((r) => r.estado === "pendiente");
  return lista;
}

// QR sin comprobante (CAJA-S2): recibos en estado pendiente. Reusa el filtro
// de listarQr para no duplicar la definición de pendiente.
export async function contarQrSinComprobante(): Promise<number> {
  return (await listarQr("sin_comprobante")).length;
}

// H1 #78: el conteo QR es informativo y nunca puede revertir ni duplicar
// un cierre ya persistido; ante cualquier fallo informa 0.
async function contarQrSinComprobanteSeguro(): Promise<number> {
  try {
    return await contarQrSinComprobante();
  } catch {
    return 0;
  }
}

export async function deshacerQr(num: string): Promise<{ status: 200; num: string; estado: string } | { status: 404; error: string } | { status: 409; error: string }> {
  const qrRecibos = crearAlmacenQrRecibos();
  const db = dbVivaTenant();
  if (!db) return deshacerQrMemoria(num, qrRecibos);
  try {
    const mem = qrRecibos.obtener(num);
    let estado = mem?.estado;
    if (estado === undefined) {
      const filas = await db.select().from(cashQrReceipts).where(eq(cashQrReceipts.numeroOperacion, num)).limit(1);
      if (!filas[0]) return { status: 404, error: "desconocido" };
      estado = filas[0].estado;
    }
    // Deshacer del auto: desvincula y vuelve a pendiente (no borra).
    if (estado === "asociado") {
      await db
        .update(cashQrReceipts)
        .set({ estado: "pendiente", cashMovementId: null })
        .where(eq(cashQrReceipts.numeroOperacion, num));
      const actual = qrRecibos.obtener(num);
      if (actual) qrRecibos.guardar(num, { ...actual, estado: "pendiente", cashMovementId: null });
      return { status: 200, num, estado: "pendiente" };
    }
    if (estado !== "pendiente") return { status: 409, error: "no deshace confirmado" };
    await db.delete(cashQrReceipts).where(eq(cashQrReceipts.numeroOperacion, num));
    qrRecibos.mapaVivo().delete(num);
    return { status: 200, num, estado: "deshecho" };
  } catch (e) {
    qrRecibos.anteFalloPersistencia(e);
    return deshacerQrMemoria(num, qrRecibos);
  }
}

function deshacerQrMemoria(num: string, qrRecibos: AlmacenVivo<QrRecibo>): { status: 200; num: string; estado: string } | { status: 404; error: string } | { status: 409; error: string } {
  const r = qrRecibos.obtener(num);
  if (!r) return { status: 404, error: "desconocido" };
  if (r.estado === "asociado") {
    qrRecibos.guardar(num, { ...r, estado: "pendiente", cashMovementId: null });
    return { status: 200, num, estado: "pendiente" };
  }
  if (r.estado !== "pendiente") return { status: 409, error: "no deshace confirmado" };
  qrRecibos.mapaVivo().delete(num);
  return { status: 200, num, estado: "deshecho" };
}

// Vencimientos (CAJA-S3): filas en cash_due_items con DB viva, memoria solo
// en single sin base. El pago crea el egreso en cash_movements.
type FilaVencimiento = typeof cashDueItems.$inferSelect;

function filaAVencimiento(f: FilaVencimiento): VencimientoCaja {
  return {
    id: f.id,
    concepto: f.concepto,
    venceEl: f.venceEl.toISOString(),
    montoCentavos: f.montoCentavos.toString(),
    estado: f.estado,
    avisadoEl: f.avisadoEl ? f.avisadoEl.toISOString() : null,
    pagadoEl: f.pagadoEl ? f.pagadoEl.toISOString() : null,
    cashMovementId: f.cashMovementId,
  };
}

export async function listarVencimientos(): Promise<VencimientoCaja[]> {
  const vencimientos = crearAlmacenVencimientosCaja();
  const db = dbVivaTenant();
  if (!db) return [...vencimientos.comoMapaSoloLectura().values()];
  try {
    const filas = await db.select().from(cashDueItems).orderBy(asc(cashDueItems.createdAt));
    const lista = filas.map(filaAVencimiento);
    for (const d of lista) vencimientos.guardar(d.id, d);
    return lista;
  } catch (e) {
    vencimientos.anteFalloPersistencia(e);
    return [...vencimientos.comoMapaSoloLectura().values()];
  }
}

export async function obtenerVencimiento(id: string): Promise<VencimientoCaja | null> {
  const vencimientos = crearAlmacenVencimientosCaja();
  const enMemoria = vencimientos.obtener(id);
  if (enMemoria) return enMemoria;
  const db = dbVivaTenant();
  if (!db) return null;
  try {
    const filas = await db.select().from(cashDueItems).where(eq(cashDueItems.id, id)).limit(1);
    const f = filas[0];
    if (!f) return null;
    const d = filaAVencimiento(f);
    vencimientos.guardar(id, d);
    return d;
  } catch (e) {
    vencimientos.anteFalloPersistencia(e);
    return vencimientos.obtener(id) ?? null;
  }
}

// Marca avisado_el en los pendientes aún sin avisar con UN solo UPDATE
// atómico (idempotente: el segundo llamado con los mismos ids marca 0).
// Devuelve solo los ids reclamados por este llamado; ante fallo de DB no
// marca nada en memoria.
export async function marcarAvisados(ids: string[], ahoraIso: string): Promise<string[]> {
  const vencimientos = crearAlmacenVencimientosCaja();
  const marcados: string[] = [];
  const db = dbVivaTenant();
  if (!db) {
    for (const id of ids) {
      const d = vencimientos.obtener(id);
      if (!d || d.estado !== "pendiente" || d.avisadoEl) continue;
      vencimientos.guardar(id, { ...d, avisadoEl: ahoraIso });
      marcados.push(id);
    }
    return marcados;
  }
  try {
    if (ids.length === 0) return [];
    const reclamados = await db
      .update(cashDueItems)
      .set({ avisadoEl: new Date(ahoraIso) })
      .where(and(inArray(cashDueItems.id, ids), eq(cashDueItems.estado, "pendiente"), isNull(cashDueItems.avisadoEl)))
      .returning({ id: cashDueItems.id });
    for (const f of reclamados) {
      const d = vencimientos.obtener(f.id);
      if (d) vencimientos.guardar(f.id, { ...d, avisadoEl: ahoraIso });
      marcados.push(f.id);
    }
    return marcados;
  } catch (e) {
    vencimientos.anteFalloPersistencia(e);
    return [];
  }
}

export async function crearVencimiento(input: { concepto: string; venceEl: string; montoCentavos: number }): Promise<VencimientoCaja> {
  const id = randomUUID();
  const d: VencimientoCaja = { id, concepto: input.concepto, venceEl: input.venceEl, montoCentavos: String(input.montoCentavos), estado: "pendiente" };
  const vencimientos = crearAlmacenVencimientosCaja();
  const db = dbVivaTenant();
  if (!db) {
    vencimientos.guardar(id, d);
    return d;
  }
  try {
    await db.insert(cashDueItems).values({ id, concepto: d.concepto, venceEl: new Date(d.venceEl), montoCentavos: BigInt(d.montoCentavos), estado: "pendiente" });
    vencimientos.guardar(id, d);
    return d;
  } catch (e) {
    vencimientos.anteFalloPersistencia(e);
    vencimientos.guardar(id, d);
    return d;
  }
}

export function esMedioValido(metodo: string): metodo is Medio {
  return (MEDIOS as string[]).includes(metodo);
}

export async function pagarVencimiento(input: { id: string; key: string; metodo?: Medio }): Promise<{ status: 200; id: string; egresoId: string } | { status: 404; error: string } | { status: 409; error: string }> {
  const metodo = input.metodo ?? "Efectivo";
  const vencimientos = crearAlmacenVencimientosCaja();
  const movimientos = crearListaMovimientos();
  const db = dbVivaTenant();
  if (!db) return pagarVencimientoMemoria({ ...input, metodo }, vencimientos, movimientos);
  try {
    const previos = await db.select().from(cashMovements).where(eq(cashMovements.idempotencyKey, input.key)).limit(1);
    const previo = previos[0];
    if (previo && previo.origen === `vencimiento:${input.id}`) {
      // Replay: repara la fila si el corte quedó entre el insert y el update,
      // sin pisar pagado_el de un pago ya registrado.
      await db
        .update(cashDueItems)
        .set({ estado: "pagada", pagadoEl: new Date(), cashMovementId: previo.id })
        .where(and(eq(cashDueItems.id, input.id), eq(cashDueItems.estado, "pendiente")));
      const d = vencimientos.obtener(input.id);
      if (d) vencimientos.guardar(input.id, { ...d, estado: "pagada", cashMovementId: previo.id });
      return { status: 200, id: input.id, egresoId: previo.id };
    }
    if (previo) return { status: 409, error: "clave en uso" };
    let d = vencimientos.obtener(input.id);
    if (!d) {
      const filas = await db.select().from(cashDueItems).where(eq(cashDueItems.id, input.id)).limit(1);
      const f = filas[0];
      if (!f) return { status: 404, error: "desconocido" };
      d = filaAVencimiento(f);
    }
    if (d.estado === "pagada") return { status: 409, error: "ya pagada" };
    const movId = randomUUID();
    const ahoraIso = new Date().toISOString();
    const mov = { id: movId, tipo: "egreso" as const, metodo, monto_centavos: d.montoCentavos, origen: `vencimiento:${input.id}`, idempotency_key: input.key, ocurrido_en: ahoraIso };
    await db.insert(cashMovements).values({
      id: movId,
      saleId: null,
      idempotencyKey: input.key,
      tipo: "egreso",
      metodo,
      categoriaId: "vencimiento",
      origen: `vencimiento:${input.id}`,
      montoCentavos: BigInt(d.montoCentavos),
    });
    await db.update(cashDueItems).set({ estado: "pagada", pagadoEl: new Date(ahoraIso), cashMovementId: movId }).where(eq(cashDueItems.id, input.id));
    vencimientos.guardar(input.id, { ...d, estado: "pagada", pagadoEl: ahoraIso, cashMovementId: movId });
    movimientos.agregar(mov);
    return { status: 200, id: input.id, egresoId: movId };
  } catch (e) {
    vencimientos.anteFalloPersistencia(e);
    return pagarVencimientoMemoria({ ...input, metodo }, vencimientos, movimientos);
  }
}

function pagarVencimientoMemoria(
  input: { id: string; key: string; metodo: Medio },
  vencimientos: AlmacenVivo<VencimientoCaja>,
  movimientos: ListaAlmacen<StoredMovement>,
): { status: 200; id: string; egresoId: string } | { status: 404; error: string } | { status: 409; error: string } {
  const previo = movimientos.listar().find((m) => m.idempotency_key === input.key);
  if (previo && previo.origen === `vencimiento:${input.id}`) return { status: 200, id: input.id, egresoId: previo.id };
  if (previo) return { status: 409, error: "clave en uso" };
  const d = vencimientos.obtener(input.id);
  if (!d) return { status: 404, error: "desconocido" };
  if (d.estado === "pagada") return { status: 409, error: "ya pagada" };
  const ahoraIso = new Date().toISOString();
  const mov = { id: randomUUID(), tipo: "egreso" as const, metodo: input.metodo, monto_centavos: d.montoCentavos, origen: `vencimiento:${input.id}`, idempotency_key: input.key, ocurrido_en: ahoraIso };
  movimientos.agregar(mov);
  vencimientos.guardar(input.id, { ...d, estado: "pagada", pagadoEl: ahoraIso, cashMovementId: mov.id });
  return { status: 200, id: input.id, egresoId: mov.id };
}

// Egreso manual de pagos a proveedores (PERS2-S14/S15, ADR-0057): lo usan los
// repos de facturas y ordenes en lugar de empujar la lista en memoria. DB primero
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
    ocurrido_en: new Date().toISOString(),
  };
  const db = dbVivaTenant();
  const movimientos = crearListaMovimientos();
  if (!db) {
    movimientos.agregar(mov);
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
    movimientos.anteFalloPersistencia(e);
  }
  movimientos.agregar(mov);
  return mov;
}

// Movimiento opuesto de una devolución (PERS2-S25, ADR-0063): lo usa el repo
// de ventas en lugar de empujar la lista en memoria. DB primero con espejo
// memoria; en multi sin base propaga BaseNoDisponible.
export async function registrarMovimientoDevolucion(input: {
  key: string;
  saleId: string;
  medio: Medio;
  montoCentavos: bigint;
  tipo: "ingreso" | "egreso";
}): Promise<StoredMovement> {
  const mov: StoredMovement = {
    id: randomUUID(),
    tipo: input.tipo,
    metodo: input.medio,
    monto_centavos: input.montoCentavos.toString(),
    origen: "devolucion",
    sale_id: input.saleId,
    idempotency_key: input.key,
    ocurrido_en: new Date().toISOString(),
  };
  const db = dbVivaTenant();
  const movimientos = crearListaMovimientos();
  if (!db) {
    movimientos.agregar(mov);
    return mov;
  }
  try {
    await db.insert(cashMovements).values({
      id: mov.id,
      saleId: input.saleId,
      idempotencyKey: input.key,
      tipo: input.tipo,
      metodo: input.medio,
      categoriaId: "devolucion_venta",
      origen: "devolucion",
      montoCentavos: input.montoCentavos,
    });
  } catch (e) {
    movimientos.anteFalloPersistencia(e);
  }
  movimientos.agregar(mov);
  return mov;
}

// Ingreso de cobro de fiado (PERS2-S17, ADR-0058): lo usa el repo de fiado en
// lugar de empujar la lista en memoria. DB primero con espejo memoria; en multi
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
    ocurrido_en: new Date().toISOString(),
  };
  const db = dbVivaTenant();
  const movimientos = crearListaMovimientos();
  if (!db) {
    movimientos.agregar(mov);
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
    movimientos.anteFalloPersistencia(e);
  }
  movimientos.agregar(mov);
  return mov;
}
