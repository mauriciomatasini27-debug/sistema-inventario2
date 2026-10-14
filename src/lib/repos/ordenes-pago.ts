import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { cashMovements } from "../../db/schema.js";
import { payees, paymentOrderEvents, paymentOrders } from "../../db/schema-pagos.js";
import { esModoMulti, tenantActual } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { store } from "../store.js";
import type { Medio } from "../validation.js";
import type { Payee, PayeeTipo } from "../../modules/payments/beneficiarios.js";
import {
  cancelar_orden,
  confirmar_pago,
  preparar_orden,
  type EventoOrden,
  type InstruccionTipo,
  type PagoConfirmado,
  type PaymentOrder,
} from "../../modules/payments/ordenes.js";
import {
  matchear_notif,
  parsear_notif_bancaria,
} from "../../modules/payments/notifs-bancarias.js";
import { fechaBA } from "../../jobs/whatsapp-aviso-matutino.js";
import { registrarEgresoRetiro } from "./caja.js";

// PERS2-S15 (ADR-0057): preparar, cancelar, confirmar pagada y sugerir desde
// notificacion, con numeracion por tenant. DB primero via dbVivaTenant();
// solo en single sin base usa la memoria particionada. En multi sin base
// dbVivaTenant lanza BaseNoDisponible y se propaga (la ruta responde 503).
// Los egresos de caja van por el repo de caja.

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

export interface RespuestaRepo {
  status: number;
  body: Record<string, unknown>;
}

function esUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// notifVistos has no table: las sugerencias desde notif viven en memoria del repo.
const notifVistos = new Map<string, unknown>();

export function limpiarVistosNotif(): void {
  notifVistos.clear();
}

function claveNotif(notifId: string): string {
  if (!esModoMulti()) return notifId;
  return `${tenantActual() ?? "?"}:${notifId}`;
}

function payeeDeFila(f: typeof payees.$inferSelect): Payee {
  return {
    id: f.id,
    nombre: f.nombre,
    tipo: (f.tipo ?? "proveedor") as Payee["tipo"],
    medioPreferido: (f.medioPreferido ?? "Transferencia") as Medio,
    ...(f.alias !== null ? { alias: f.alias } : {}),
    ...(f.cbu !== null ? { cbu: f.cbu } : {}),
    ...(f.cuit !== null ? { cuit: f.cuit } : {}),
    ...(f.linkPagoUrl !== null ? { linkPagoUrl: f.linkPagoUrl } : {}),
    activo: f.activo ?? true,
  };
}

async function payeesVivos(db: TenantDb): Promise<Map<string, Payee>> {
  const vivos = new Map<string, Payee>(store.payees);
  try {
    const filas = await db.select().from(payees).where(eq(payees.activo, true));
    for (const f of filas) {
      if (!vivos.has(f.id)) vivos.set(f.id, payeeDeFila(f));
    }
  } catch {
    // Sin filas frias la memoria caliente alcanza; el error real lo vera el insert.
  }
  return vivos;
}

function eventoDeFila(f: typeof paymentOrderEvents.$inferSelect): EventoOrden {
  const detalle = (f.detalle ?? {}) as { motivo?: unknown };
  return {
    de: (f.deEstado ?? null) as EventoOrden["de"],
    a: f.aEstado as EventoOrden["a"],
    actor: f.actor,
    origen: (f.origen ?? "web") as EventoOrden["origen"],
    ...(typeof detalle.motivo === "string" ? { motivo: detalle.motivo } : {}),
    atMs: f.createdAt ? f.createdAt.getTime() : Date.now(),
  };
}

async function eventosDeOrden(db: TenantDb, ordenId: string): Promise<EventoOrden[]> {
  const filas = await db
    .select()
    .from(paymentOrderEvents)
    .where(eq(paymentOrderEvents.paymentOrderId, ordenId));
  return filas.map(eventoDeFila);
}

function ordenDeFila(
  f: typeof paymentOrders.$inferSelect,
  eventos: ReadonlyArray<EventoOrden>,
): PaymentOrder {
  const snap = (f.instruccionSnapshot ?? {}) as { linkUrl?: unknown; referencia?: unknown };
  return {
    id: f.id,
    numero: f.numero,
    payeeId: f.payeeId,
    tipo: (f.tipo ?? "proveedor") as PayeeTipo,
    concepto: f.concepto,
    montoCentavos: f.montoCentavos,
    venceElMs: f.venceEl.getTime(),
    medioSugerido: f.metodoSugerido as Medio,
    instruccion: f.instruccionTipo as InstruccionTipo,
    ...(typeof snap.linkUrl === "string" ? { linkUrl: snap.linkUrl } : {}),
    ...(typeof snap.referencia === "string"
      ? { referencia: snap.referencia }
      : f.referencia !== null
        ? { referencia: f.referencia }
        : {}),
    ...(f.supplierInvoiceId !== null ? { supplierInvoiceId: f.supplierInvoiceId } : {}),
    ...(f.servicioId !== null ? { servicioId: f.servicioId } : {}),
    categoria: (f.categoria ?? "pago_proveedores") as PaymentOrder["categoria"],
    estado: (f.estado ?? "preparada") as PaymentOrder["estado"],
    version: f.version ?? 1,
    idempotencyKey: f.idempotencyKey,
    ...(f.nota !== null ? { nota: f.nota } : {}),
    ...(f.comprobanteRef !== null ? { comprobanteRef: f.comprobanteRef } : {}),
    ...(f.paidAmountCentavos !== null ? { montoPagadoCentavos: f.paidAmountCentavos } : {}),
    ...(f.paidMethod !== null ? { medioPagado: f.paidMethod as Medio } : {}),
    ...(f.cancelMotivo !== null ? { motivoCancelacion: f.cancelMotivo } : {}),
    eventos: [...eventos],
  };
}

async function leerOrdenFria(db: TenantDb, orderId: string): Promise<PaymentOrder | null> {
  if (!esUuid(orderId)) return null;
  const filas = await db.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).limit(1);
  const fila = filas[0];
  if (!fila) return null;
  return ordenDeFila(fila, await eventosDeOrden(db, fila.id));
}

async function leerOrdenPorKey(db: TenantDb, key: string): Promise<PaymentOrder | null> {
  const filas = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.idempotencyKey, key))
    .limit(1);
  const fila = filas[0];
  if (!fila) return null;
  return ordenDeFila(fila, await eventosDeOrden(db, fila.id));
}

function maxSufijo(numeros: ReadonlyArray<string>): number {
  let max = 0;
  for (const n of numeros) {
    const m = /^OP-(\d+)$/.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

// Numeracion por tenant: con DB viva el siguiente sale del maximo entre las
// filas del tenant y el espejo memoria; sin base rige el contador en memoria.
async function siguienteNumero(db: TenantDb | null): Promise<{ numero: string; n: number }> {
  if (!db) {
    const n = store.payOrderCounter;
    return { numero: `OP-${String(n).padStart(4, "0")}`, n };
  }
  const filas = await db.select({ numero: paymentOrders.numero }).from(paymentOrders);
  const numeros = filas.map((f) => f.numero);
  for (const o of store.paymentOrders.values()) numeros.push(o.numero);
  for (const o of store.paymentOrderVistos.values()) numeros.push(o.numero);
  const n = maxSufijo(numeros) + 1;
  return { numero: `OP-${String(n).padStart(4, "0")}`, n };
}

export interface PrepararOrdenInput {
  readonly key: string;
  readonly payeeId: string;
  readonly concepto: string;
  readonly montoCentavos: bigint;
  readonly venceElMs: number;
  readonly medioSugerido: Medio;
  readonly instruccion: InstruccionTipo;
  readonly linkUrl?: string | undefined;
  readonly referencia?: string | undefined;
  readonly categoria?: PaymentOrder["categoria"] | undefined;
  readonly nota?: string | undefined;
  readonly creadoPor: string;
}

// El bot prepara, el comerciante paga. La plata NUNCA se mueve aca.
export async function prepararOrdenRepo(input: PrepararOrdenInput): Promise<RespuestaRepo> {
  const db = dbVivaTenant();
  if (!db) {
    const n = store.payOrderCounter;
    const r = preparar_orden({
      id: randomUUID(),
      idempotencyKey: input.key,
      numero: `OP-${String(n).padStart(4, "0")}`,
      payeeId: input.payeeId,
      payees: store.payees,
      concepto: input.concepto,
      montoCentavos: input.montoCentavos,
      venceElMs: input.venceElMs,
      medioSugerido: input.medioSugerido,
      instruccion: input.instruccion,
      ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
      ...(input.referencia !== undefined ? { referencia: input.referencia } : {}),
      ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
      ...(input.nota !== undefined ? { nota: input.nota } : {}),
      creadoPor: input.creadoPor,
      origen: "web",
      ahoraMs: Date.now(),
      vistos: store.paymentOrderVistos,
    });
    if (!r.ok) return mapearFalloOrden(r);
    store.payOrderCounter = n + 1;
    store.paymentOrders.set(r.orden.id, r.orden);
    return { status: 201, body: { order_id: r.orden.id, numero: r.orden.numero, estado: r.orden.estado } };
  }

  try {
    const previo = await leerOrdenPorKey(db, input.key);
    if (previo) {
      store.paymentOrders.set(previo.id, previo);
      store.paymentOrderVistos.set(input.key, previo);
      return { status: 409, body: { error: "idempotency-key repetida" } };
    }
    const visto = store.paymentOrderVistos.get(input.key);
    if (visto) return { status: 409, body: { error: "idempotency-key repetida" } };
    const { numero, n } = await siguienteNumero(db);
    const r = preparar_orden({
      id: randomUUID(),
      idempotencyKey: input.key,
      numero,
      payeeId: input.payeeId,
      payees: await payeesVivos(db),
      concepto: input.concepto,
      montoCentavos: input.montoCentavos,
      venceElMs: input.venceElMs,
      medioSugerido: input.medioSugerido,
      instruccion: input.instruccion,
      ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
      ...(input.referencia !== undefined ? { referencia: input.referencia } : {}),
      ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
      ...(input.nota !== undefined ? { nota: input.nota } : {}),
      creadoPor: input.creadoPor,
      origen: "web",
      ahoraMs: Date.now(),
      vistos: new Map(),
    });
    if (!r.ok) return mapearFalloOrden(r);
    const payee = (await payeesVivos(db)).get(input.payeeId);
    try {
      await db.transaction(async (tx) => {
        await tx.insert(paymentOrders).values({
          id: r.orden.id,
          idempotencyKey: input.key,
          numero: r.orden.numero,
          payeeId: esUuid(input.payeeId) ? input.payeeId : (payee && esUuid(payee.id) ? payee.id : r.orden.id),
          tipo: r.orden.tipo,
          concepto: r.orden.concepto,
          categoria: r.orden.categoria,
          montoCentavos: r.orden.montoCentavos,
          venceEl: new Date(r.orden.venceElMs),
          metodoSugerido: r.orden.medioSugerido,
          instruccionTipo: r.orden.instruccion,
          instruccionSnapshot: {
            ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
            ...(input.referencia !== undefined ? { referencia: input.referencia } : {}),
            medioSugerido: r.orden.medioSugerido,
          } as never,
          referencia: r.orden.referencia ?? null,
          estado: r.orden.estado,
          version: r.orden.version,
          creadoPor: input.creadoPor,
        });
        await tx.insert(paymentOrderEvents).values({
          paymentOrderId: r.orden.id,
          deEstado: null,
          aEstado: r.orden.estado,
          version: r.orden.version,
          actor: input.creadoPor,
          origen: "web",
        });
      });
    } catch (e) {
      const rival = await leerOrdenPorKey(db, input.key).catch(() => null);
      if (rival) {
        store.paymentOrders.set(rival.id, rival);
        store.paymentOrderVistos.set(input.key, rival);
        return { status: 409, body: { error: "idempotency-key repetida" } };
      }
      throw e;
    }
    store.payOrderCounter = Math.max(store.payOrderCounter, n + 1);
    store.paymentOrders.set(r.orden.id, r.orden);
    store.paymentOrderVistos.set(input.key, r.orden);
    return {
      status: 201,
      body: { order_id: r.orden.id, numero: r.orden.numero, estado: r.orden.estado, fuente: "db" },
    };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    const n = store.payOrderCounter;
    const r = preparar_orden({
      id: randomUUID(),
      idempotencyKey: input.key,
      numero: `OP-${String(n).padStart(4, "0")}`,
      payeeId: input.payeeId,
      payees: store.payees,
      concepto: input.concepto,
      montoCentavos: input.montoCentavos,
      venceElMs: input.venceElMs,
      medioSugerido: input.medioSugerido,
      instruccion: input.instruccion,
      ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
      ...(input.referencia !== undefined ? { referencia: input.referencia } : {}),
      ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
      ...(input.nota !== undefined ? { nota: input.nota } : {}),
      creadoPor: input.creadoPor,
      origen: "web",
      ahoraMs: Date.now(),
      vistos: store.paymentOrderVistos,
    });
    if (!r.ok) return mapearFalloOrden(r);
    store.payOrderCounter = n + 1;
    store.paymentOrders.set(r.orden.id, r.orden);
    return { status: 201, body: { order_id: r.orden.id, numero: r.orden.numero, estado: r.orden.estado } };
  }
}

function mapearFalloOrden(r: { codigo: string; status: number; error?: string }): RespuestaRepo {
  if (r.codigo === "YA_VISTA") return { status: 409, body: { error: "idempotency-key repetida" } };
  if (r.codigo === "SOLO_DUENO") return { status: 403, body: { error: r.error ?? "solo dueno" } };
  if (r.codigo === "VERSION_DESACTUALIZADA")
    return { status: 409, body: { error: "version desactualizada" } };
  return { status: r.status, body: { error: r.error ?? "dato invalido" } };
}

// Cancelacion auditada (solo Dueno).
export async function cancelarOrdenRepo(input: {
  orderId: string;
  versionEsperada: number;
  motivo: string;
  actor: string;
}): Promise<RespuestaRepo> {
  const enMemoria = store.paymentOrders.get(input.orderId);
  const db = dbVivaTenant();
  if (!db) {
    if (!enMemoria) return { status: 404, body: { error: "orden inexistente" } };
    return cancelarEnMemoria(enMemoria, input);
  }

  try {
    const orden = enMemoria ?? (await leerOrdenFria(db, input.orderId));
    if (!orden) return { status: 404, body: { error: "orden inexistente" } };
    const r = cancelar_orden({
      orden,
      versionEsperada: input.versionEsperada,
      motivo: input.motivo,
      rol: "dueno",
      actor: input.actor,
      origen: "web",
      ahoraMs: Date.now(),
    });
    if (!r.ok) return mapearFalloOrden(r);
    const tocadas = await db
      .update(paymentOrders)
      .set({ estado: r.orden.estado, version: r.orden.version, cancelMotivo: r.orden.motivoCancelacion ?? null })
      .where(eq(paymentOrders.id, r.orden.id))
      .returning({ id: paymentOrders.id });
    if (!tocadas[0]) return { status: 409, body: { error: "version desactualizada" } };
    await db.insert(paymentOrderEvents).values({
      paymentOrderId: r.orden.id,
      deEstado: orden.estado,
      aEstado: r.orden.estado,
      version: r.orden.version,
      actor: input.actor,
      origen: "web",
      detalle: { motivo: r.orden.motivoCancelacion ?? null } as never,
    });
    store.paymentOrders.set(r.orden.id, r.orden);
    return { status: 200, body: { order_id: r.orden.id, estado: r.orden.estado, fuente: "db" } };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    if (!enMemoria) return { status: 404, body: { error: "orden inexistente" } };
    return cancelarEnMemoria(enMemoria, input);
  }
}

function cancelarEnMemoria(
  orden: PaymentOrder,
  input: { orderId: string; versionEsperada: number; motivo: string; actor: string },
): RespuestaRepo {
  const r = cancelar_orden({
    orden,
    versionEsperada: input.versionEsperada,
    motivo: input.motivo,
    rol: "dueno",
    actor: input.actor,
    origen: "web",
    ahoraMs: Date.now(),
  });
  if (!r.ok) return mapearFalloOrden(r);
  store.paymentOrders.set(input.orderId, r.orden);
  return { status: 200, body: { order_id: r.orden.id, estado: r.orden.estado } };
}

export interface ConfirmarPagoOrdenInput {
  readonly key: string;
  readonly orderId: string;
  readonly versionEsperada: number;
  readonly montoPagadoCentavos?: bigint | undefined;
  readonly medio: Medio;
  readonly nota?: string | undefined;
  readonly comprobanteRef?: string | undefined;
  readonly actor: string;
}

// `Ya pague` (solo Dueno). Registra el egreso en caja por el repo de caja y
// marca la orden pagada.
export async function confirmarPagoOrdenRepo(input: ConfirmarPagoOrdenInput): Promise<RespuestaRepo> {
  const enMemoria = store.paymentOrders.get(input.orderId);
  const db = dbVivaTenant();
  if (!db) {
    if (!enMemoria) return { status: 404, body: { error: "orden inexistente" } };
    const r = confirmar_pago({
      idempotencyKey: input.key,
      orden: enMemoria,
      versionEsperada: input.versionEsperada,
      ...(input.montoPagadoCentavos !== undefined ? { montoPagadoCentavos: input.montoPagadoCentavos } : {}),
      medio: input.medio,
      ...(input.nota !== undefined ? { nota: input.nota } : {}),
      ...(input.comprobanteRef !== undefined ? { comprobanteRef: input.comprobanteRef } : {}),
      rol: "dueno",
      actor: input.actor,
      origen: "web",
      ahoraMs: Date.now(),
      vistosPagos: store.paymentPagosVistos,
    });
    if (!r.ok) return mapearFalloOrden(r);
    store.paymentOrders.set(input.orderId, r.efecto.orden);
    await registrarEgresoRetiro({
      key: input.key,
      montoCentavos: r.efecto.egreso.monto_centavos,
      metodo: r.efecto.egreso.metodo,
    });
    return { status: 200, body: { order_id: r.efecto.orden.id, estado: r.efecto.orden.estado } };
  }

  try {
    const orden = enMemoria ?? (await leerOrdenFria(db, input.orderId));
    if (!orden) return { status: 404, body: { error: "orden inexistente" } };
    if (store.paymentPagosVistos.has(input.key)) {
      return { status: 409, body: { error: "idempotency-key repetida" } };
    }
    // Replay en frio: el egreso durable con la misma key delata el pago ya hecho.
    const pagoPrevio = await db
      .select({ id: cashMovements.id })
      .from(cashMovements)
      .where(eq(cashMovements.idempotencyKey, input.key))
      .limit(1);
    if (pagoPrevio[0]) return { status: 409, body: { error: "idempotency-key repetida" } };
    const vistosTx = new Map<string, PagoConfirmado>();
    const r = confirmar_pago({
      idempotencyKey: input.key,
      orden,
      versionEsperada: input.versionEsperada,
      ...(input.montoPagadoCentavos !== undefined ? { montoPagadoCentavos: input.montoPagadoCentavos } : {}),
      medio: input.medio,
      ...(input.nota !== undefined ? { nota: input.nota } : {}),
      ...(input.comprobanteRef !== undefined ? { comprobanteRef: input.comprobanteRef } : {}),
      rol: "dueno",
      actor: input.actor,
      origen: "web",
      ahoraMs: Date.now(),
      vistosPagos: vistosTx,
    });
    if (!r.ok) return mapearFalloOrden(r);
    await registrarEgresoRetiro({
      key: input.key,
      montoCentavos: r.efecto.egreso.monto_centavos,
      metodo: r.efecto.egreso.metodo,
    });
    const tocadas = await db
      .update(paymentOrders)
      .set({
        estado: r.efecto.orden.estado,
        version: r.efecto.orden.version,
        paidAt: new Date(Date.now()),
        paidAmountCentavos: r.efecto.orden.montoPagadoCentavos ?? null,
        paidMethod: r.efecto.orden.medioPagado ?? null,
        nota: r.efecto.orden.nota ?? null,
        comprobanteRef: r.efecto.orden.comprobanteRef ?? null,
      })
      .where(eq(paymentOrders.id, r.efecto.orden.id))
      .returning({ id: paymentOrders.id });
    if (!tocadas[0]) return { status: 409, body: { error: "version desactualizada" } };
    await db.insert(paymentOrderEvents).values({
      paymentOrderId: r.efecto.orden.id,
      deEstado: orden.estado,
      aEstado: r.efecto.orden.estado,
      version: r.efecto.orden.version,
      actor: input.actor,
      origen: "web",
    });
    store.paymentOrders.set(r.efecto.orden.id, r.efecto.orden);
    store.paymentPagosVistos.set(input.key, r.efecto);
    return {
      status: 200,
      body: { order_id: r.efecto.orden.id, estado: r.efecto.orden.estado, fuente: "db" },
    };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    if (!enMemoria) return { status: 404, body: { error: "orden inexistente" } };
    const r = confirmar_pago({
      idempotencyKey: input.key,
      orden: enMemoria,
      versionEsperada: input.versionEsperada,
      ...(input.montoPagadoCentavos !== undefined ? { montoPagadoCentavos: input.montoPagadoCentavos } : {}),
      medio: input.medio,
      ...(input.nota !== undefined ? { nota: input.nota } : {}),
      ...(input.comprobanteRef !== undefined ? { comprobanteRef: input.comprobanteRef } : {}),
      rol: "dueno",
      actor: input.actor,
      origen: "web",
      ahoraMs: Date.now(),
      vistosPagos: store.paymentPagosVistos,
    });
    if (!r.ok) return mapearFalloOrden(r);
    store.paymentOrders.set(input.orderId, r.efecto.orden);
    await registrarEgresoRetiro({
      key: input.key,
      montoCentavos: r.efecto.egreso.monto_centavos,
      metodo: r.efecto.egreso.metodo,
    });
    return { status: 200, body: { order_id: r.efecto.orden.id, estado: r.efecto.orden.estado } };
  }
}

export interface SugerirNotifInput {
  readonly texto: string;
  readonly notifId: string;
  readonly hoyIso?: string | undefined;
  readonly ventanaDias?: number | undefined;
}

// Dado el texto de una notificacion bancaria sugiere ordenes en
// preparada|vencida con monto exacto y vencimiento ±2 dias. SOLO sugiere:
// jamas confirma ni paga.
export async function sugerirDesdeNotifRepo(input: {
  texto: unknown;
  notifId: unknown;
  hoyIso: unknown;
  ventanaDias: unknown;
}): Promise<RespuestaRepo> {
  const { texto, notifId, hoyIso: hoyIsoRaw, ventanaDias: ventanaRaw } = input;
  if (typeof texto !== "string" || texto.trim().length === 0 || texto.length > 2000) {
    return { status: 422, body: { error: "texto requerido (1-2000)" } };
  }
  if (typeof notifId !== "string" || notifId.length === 0 || notifId.length > 128) {
    return { status: 422, body: { error: "notif_id requerido (1-128)" } };
  }
  const hoyIso = typeof hoyIsoRaw === "string" ? hoyIsoRaw : fechaBA(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoyIso)) {
    return { status: 422, body: { error: "hoy_iso YYYY-MM-DD" } };
  }
  const ventana = ventanaRaw === undefined ? 2 : ventanaRaw;
  if (typeof ventana !== "number" || !Number.isInteger(ventana) || ventana < 0 || ventana > 30) {
    return { status: 422, body: { error: "ventana_dias 0-30" } };
  }
  const clave = claveNotif(notifId);
  const previo = notifVistos.get(clave);
  if (previo !== undefined) {
    return { status: 409, body: { error: "notif_id repetida", original: previo } };
  }
  const p = parsear_notif_bancaria(texto, hoyIso);
  if (!p.ok) return { status: 422, body: { error: p.error } };
  const ordenes = await listarOrdenesSugerencia();
  const m = matchear_notif(p.notif, ordenes, ventana);
  const respuesta = {
    notif: {
      banco: p.notif.banco,
      monto_centavos: p.notif.montoCentavos.toString(),
      fecha_iso: p.notif.fechaIso,
      referencia: p.notif.referencia,
    },
    candidatos: m.candidatos,
    evaluadas: m.evaluadas,
  };
  notifVistos.set(clave, respuesta);
  return { status: 200, body: respuesta as unknown as Record<string, unknown> };
}

async function listarOrdenesSugerencia(): Promise<PaymentOrder[]> {
  const db = dbVivaTenant();
  if (!db) return [...store.paymentOrders.values()];
  try {
    const filas = await db.select().from(paymentOrders);
    const union = new Map<string, PaymentOrder>();
    for (const o of store.paymentOrders.values()) union.set(o.id, o);
    for (const f of filas) {
      if (!union.has(f.id)) union.set(f.id, ordenDeFila(f, []));
    }
    return [...union.values()];
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return [...store.paymentOrders.values()];
  }
}
