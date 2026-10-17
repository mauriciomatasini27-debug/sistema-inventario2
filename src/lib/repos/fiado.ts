import { eq } from "drizzle-orm";
import { customerMovements, customers } from "../../db/schema-credito.js";
import { SERIE_MOSTRADOR, ticketCounters } from "../../db/schema.js";
import { dbVivaTenant } from "../server-db.js";
import {
  crearAlmacenCreditoVistos,
  crearAlmacenStock,
  crearContadorTickets,
  crearListaMovimientosCredito,
} from "./_almacen.js";
import type { Medio } from "../validation.js";
import { lotesDesdeStock, type Sku } from "../../modules/inventario/inventario.js";
import { cobro_fiado, venta_a_cuenta } from "../../modules/credit/fiado.js";
import { siguiente_numero } from "../../modules/sales/vender_mostrador.js";
import { UMBRAL_MORA_DIAS, derivar_saldo, dias_atraso } from "../../modules/credit/saldos.js";
import { registrarIngresoCobro } from "./caja.js";

// PERS2-S17 (ADR-0058): fiado (venta a cuenta, cobros, saldo por cliente).
// DB primero via dbVivaTenant(); solo en single sin base usa la memoria
// particionada. En multi sin base dbVivaTenant lanza BaseNoDisponible y se
// propaga (la ruta responde 503). Los ingresos a caja van por caja.ts.

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

export interface LineaFiado {
  readonly sku: string;
  readonly qty: number;
  readonly precioCentavos: number;
}

export interface VentaACuentaInput {
  readonly key: string;
  readonly customerId: string;
  readonly lineas: ReadonlyArray<LineaFiado>;
  readonly deviceCode: string;
  readonly seqLocal: number;
  readonly topeCentavos: number;
  readonly saldoActualCentavos: number;
}

export type VentaACuentaResultado =
  | { ok: true; ticketDefinitivo: string | null; totalCentavos: string; fuente: "db" | "memoria" }
  | { ok: false; codigo: string; status: number; error: string };

// FC2/C18: descuenta stock, suma fiado, cero caja. Clave repetida => 409 con
// relectura; el debe entra con espejo memoria.
export async function ventaACuenta(input: VentaACuentaInput): Promise<VentaACuentaResultado> {
  const creditoVistos = crearAlmacenCreditoVistos();
  const movsCredito = crearListaMovimientosCredito();
  const contadorTickets = crearContadorTickets();
  const almacenStock = crearAlmacenStock();
  if (creditoVistos.contiene(input.key)) {
    return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
  }
  const nt = contadorTickets.leer();
  const r = venta_a_cuenta({
    idempotencyKey: input.key,
    customerId: input.customerId,
    lineas: input.lineas.map((l) => ({ sku: l.sku as Sku, cantidad: l.qty, precioCentavos: BigInt(l.precioCentavos) })),
    deviceCode: input.deviceCode,
    seqLocal: input.seqLocal,
    offline: false,
    // Ningun repo cubre lotes FIFO: se leen de la memoria particionada.
    lotes: lotesDesdeStock(almacenStock.mapaVivo()),
    vistos: new Map(),
    ultimoDefinitivo: nt > 1 ? { n: nt - 1 } : null,
    saldoActualCentavos: BigInt(input.saldoActualCentavos),
    topeCentavos: BigInt(input.topeCentavos),
    rol: "dueno",
    ahoraMs: Date.now(),
  });
  if (!r.ok) {
    return { ok: false, codigo: r.codigo, status: r.status as number, error: r.codigo };
  }
  const total = input.lineas.reduce((acc, l) => acc + BigInt(l.qty) * BigInt(l.precioCentavos), 0n);

  const espejoMemoria = (ticket: string | null, siguiente: number | null) => {
    // Sin tabla propia: vistos y movimientos en memoria (durable via UNIQUE).
    creditoVistos.guardar(input.key, { customer_id: input.customerId });
    movsCredito.agregar({ customer_id: input.customerId, debe: total.toString(), haber: "0", key: input.key, fecha_ms: Date.now() });
    // Espejo del correlativo T-*: en memoria avanza de a uno; con base viva
    // se alinea al número dado por ticket_counters (PERS5-S3).
    if (ticket) {
      const actual = contadorTickets.leer();
      contadorTickets.fijar(siguiente !== null ? Math.max(actual, siguiente) : actual + 1);
    }
  };

  const db = dbVivaTenant();
  if (!db) {
    const dup = movsCredito.listar().find((m) => m.key === input.key);
    if (dup) return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    espejoMemoria(r.efecto.ticket.definitivo, null);
    return { ok: true, ticketDefinitivo: r.efecto.ticket.definitivo, totalCentavos: total.toString(), fuente: "memoria" };
  }

  try {
    const salida = await db.transaction(async (tx) => {
      // PERS5-S3: el número sale de ticket_counters (serie mostrador,
      // FOR UPDATE) en la misma tx que inserta customer_movements, igual
      // que ventas y promote: sin T-* repetidos entre los tres.
      let filas = await tx.select().from(ticketCounters).where(eq(ticketCounters.id, SERIE_MOSTRADOR)).for("update");
      if (!filas[0]) {
        await tx.insert(ticketCounters).values({ id: SERIE_MOSTRADOR, ultimo: 0 }).onConflictDoNothing();
        filas = await tx.select().from(ticketCounters).where(eq(ticketCounters.id, SERIE_MOSTRADOR)).for("update");
      }
      const ultimo = filas[0]?.ultimo ?? 0;
      const previo = await tx.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, input.key)).limit(1);
      if (previo[0]) return { estado: "repetida" } as const;
      // Sin definitivo (offline) no consume número, igual que ventas.
      const definitivo = r.efecto.ticket.definitivo !== null;
      const n = definitivo ? ultimo + 1 : ultimo;
      const ticket = definitivo ? siguiente_numero(ultimo > 0 ? { n: ultimo } : null) : null;
      await tx.insert(customerMovements).values({
        customerId: input.customerId,
        tipo: "venta",
        debeCentavos: total,
        haberCentavos: 0n,
        idempotencyKey: input.key,
        clientOccurredAt: new Date(),
      });
      if (definitivo) await tx.update(ticketCounters).set({ ultimo: n }).where(eq(ticketCounters.id, SERIE_MOSTRADOR));
      return { estado: "ok", ticket, n } as const;
    });
    if (salida.estado === "repetida") {
      return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    }
    espejoMemoria(salida.ticket, salida.n + 1);
    return { ok: true, ticketDefinitivo: salida.ticket, totalCentavos: total.toString(), fuente: "db" };
  } catch (e) {
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, input.key)).limit(1);
        if (previo[0]) return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
      } catch {
        // Cae al espejo memoria de abajo.
      }
      creditoVistos.anteFalloPersistencia(e);
    } else {
      creditoVistos.anteFalloPersistencia(e);
    }
    if (creditoVistos.contiene(input.key)) {
      return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    }
    espejoMemoria(r.efecto.ticket.definitivo, null);
    return { ok: true, ticketDefinitivo: r.efecto.ticket.definitivo, totalCentavos: total.toString(), fuente: "memoria" };
  }
}

export interface CobroFiadoInput {
  readonly key: string;
  readonly customerId: string;
  readonly montoCentavos: bigint;
  readonly medio: Medio;
}

export type CobroFiadoResultado =
  | { ok: true; customerId: string; haberCentavos: string; fuente: "db" | "memoria" }
  | { ok: false; codigo: string; status: number; error: string };

// C18: cobro ingresa a caja (origen cobro_fiado). Clave repetida => 409 con
// relectura; cobro e ingreso entran con espejo memoria.
export async function cobroFiado(input: CobroFiadoInput): Promise<CobroFiadoResultado> {
  const creditoVistos = crearAlmacenCreditoVistos();
  const movsCredito = crearListaMovimientosCredito();
  if (creditoVistos.contiene(input.key)) {
    return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
  }
  const r = cobro_fiado({
    idempotencyKey: input.key,
    customerId: input.customerId,
    montoCentavos: input.montoCentavos,
    medio: input.medio,
    ahoraMs: Date.now(),
    vistos: new Map(),
  });
  if (!r.ok) return { ok: false, codigo: r.codigo, status: r.status as number, error: r.codigo };

  const espejoCredito = () => {
    creditoVistos.guardar(input.key, { customer_id: input.customerId });
    movsCredito.agregar({ customer_id: input.customerId, debe: "0", haber: input.montoCentavos.toString(), key: input.key });
  };

  const db = dbVivaTenant();
  if (!db) {
    const dup = movsCredito.listar().find((m) => m.key === input.key);
    if (dup) return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    espejoCredito();
    await registrarIngresoCobro({ key: input.key, montoCentavos: input.montoCentavos, medio: input.medio });
    return { ok: true, customerId: input.customerId, haberCentavos: input.montoCentavos.toString(), fuente: "memoria" };
  }

  try {
    const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, input.key)).limit(1);
    if (previo[0]) return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    await db.insert(customerMovements).values({
      customerId: input.customerId,
      tipo: "cobro",
      debeCentavos: 0n,
      haberCentavos: input.montoCentavos,
      idempotencyKey: input.key,
      clientOccurredAt: new Date(),
    });
    await registrarIngresoCobro({ key: input.key, montoCentavos: input.montoCentavos, medio: input.medio });
    espejoCredito();
    return { ok: true, customerId: input.customerId, haberCentavos: input.montoCentavos.toString(), fuente: "db" };
  } catch (e) {
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, input.key)).limit(1);
        if (previo[0]) return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
      } catch {
        // Cae al espejo memoria de abajo.
      }
      creditoVistos.anteFalloPersistencia(e);
    } else {
      creditoVistos.anteFalloPersistencia(e);
    }
    if (creditoVistos.contiene(input.key)) {
      return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    }
    espejoCredito();
    await registrarIngresoCobro({ key: input.key, montoCentavos: input.montoCentavos, medio: input.medio });
    return { ok: true, customerId: input.customerId, haberCentavos: input.montoCentavos.toString(), fuente: "memoria" };
  }
}

export interface SaldoCliente {
  readonly saldoCentavos: string;
  readonly diasMax: number;
  readonly fuente: "db" | "memoria";
}

// Saldo derivado (SUM, no persistido) + mora dia 15. Con DB viva deriva de
// customer_movements; sin DB cae a memoria. En multi sin base propaga.
export async function saldoCliente(customerId: string, hoyMs: number): Promise<SaldoCliente> {
  const creditoVistos = crearAlmacenCreditoVistos();
  const db = dbVivaTenant();
  if (!db) return saldoMemoria(customerId, hoyMs);
  try {
    const filas = await db
      .select({
        debe: customerMovements.debeCentavos,
        haber: customerMovements.haberCentavos,
        ocurridoEn: customerMovements.clientOccurredAt,
      })
      .from(customerMovements)
      .where(eq(customerMovements.customerId, customerId));
    const saldo = derivar_saldo(filas.map((f) => ({ debeCentavos: BigInt(f.debe), haberCentavos: BigInt(f.haber) })));
    let diasMax = 0;
    for (const f of filas) {
      if (BigInt(f.debe) <= 0n) continue;
      const d = dias_atraso(new Date(f.ocurridoEn).getTime(), hoyMs);
      if (d > diasMax) diasMax = d;
    }
    return { saldoCentavos: saldo.toString(), diasMax, fuente: "db" };
  } catch (e) {
    creditoVistos.anteFalloPersistencia(e);
    return saldoMemoria(customerId, hoyMs);
  }
}

function saldoMemoria(customerId: string, hoyMs: number): SaldoCliente {
  const movs = crearListaMovimientosCredito().listar().filter((m) => m.customer_id === customerId);
  const saldo = derivar_saldo(movs.map((m) => ({ debeCentavos: BigInt(m.debe), haberCentavos: BigInt(m.haber) })));
  let diasMax = 0;
  for (const m of movs) {
    if (BigInt(m.debe) <= 0n) continue;
    if (typeof m.fecha_ms !== "number") continue;
    const d = dias_atraso(m.fecha_ms, hoyMs);
    if (d > diasMax) diasMax = d;
  }
  return { saldoCentavos: saldo.toString(), diasMax, fuente: "memoria" };
}

// BOT-S4 (PRD-BOT-01): clientes con saldo para la cobranza del bot pyme.
// Mismo cálculo que saldoCliente (SUM debe-haber; diasMax sobre los
// movimientos deudores) para todos los clientes del tenant de la base viva.
// La ficha (nombre, teléfono, tope) sale de customers; un movimiento sin
// ficha usa el id como nombre, sin teléfono y sin tope. Sin DB: memoria.
export interface ClienteConSaldo {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly saldoCentavos: bigint;
  readonly topeCentavos: bigint;
  readonly diasMax: number;
}

interface MovSaldo {
  readonly customerId: string;
  readonly debe: bigint;
  readonly haber: bigint;
  readonly fechaMs: number | null;
}

interface FichaSaldo {
  readonly nombre: string;
  readonly telefono: string | null;
  readonly topeCentavos: bigint;
}

function agruparSaldos(movs: ReadonlyArray<MovSaldo>, fichas: ReadonlyMap<string, FichaSaldo>, hoyMs: number): ClienteConSaldo[] {
  const porCliente = new Map<string, MovSaldo[]>();
  for (const m of movs) {
    const lista = porCliente.get(m.customerId);
    if (lista) lista.push(m);
    else porCliente.set(m.customerId, [m]);
  }
  const out: ClienteConSaldo[] = [];
  for (const [id, lista] of porCliente) {
    const saldo = derivar_saldo(lista.map((m) => ({ debeCentavos: m.debe, haberCentavos: m.haber })));
    let diasMax = 0;
    for (const m of lista) {
      if (m.debe <= 0n || m.fechaMs === null) continue;
      const d = dias_atraso(m.fechaMs, hoyMs);
      if (d > diasMax) diasMax = d;
    }
    const ficha = fichas.get(id);
    out.push({
      id,
      nombre: ficha?.nombre ?? id,
      telefono: ficha?.telefono ?? null,
      saldoCentavos: saldo,
      topeCentavos: ficha?.topeCentavos ?? 0n,
      diasMax,
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function listarClientesConSaldo(hoyMs: number): Promise<{ clientes: ClienteConSaldo[]; fuente: "db" | "memoria" }> {
  const creditoVistos = crearAlmacenCreditoVistos();
  const db = dbVivaTenant();
  if (!db) return clientesConSaldoMemoria(hoyMs);
  try {
    const movs = await db
      .select({
        customerId: customerMovements.customerId,
        debe: customerMovements.debeCentavos,
        haber: customerMovements.haberCentavos,
        ocurridoEn: customerMovements.clientOccurredAt,
      })
      .from(customerMovements);
    const fichas = await db
      .select({ id: customers.id, nombre: customers.nombre, telefono: customers.telefono, tope: customers.topeCentavos })
      .from(customers);
    const mapa = new Map<string, FichaSaldo>(
      fichas.map((f) => [String(f.id), { nombre: f.nombre, telefono: f.telefono, topeCentavos: BigInt(f.tope) }]),
    );
    const clientes = agruparSaldos(
      movs.map((m) => ({
        customerId: m.customerId,
        debe: BigInt(m.debe),
        haber: BigInt(m.haber),
        fechaMs: new Date(m.ocurridoEn).getTime(),
      })),
      mapa,
      hoyMs,
    );
    return { clientes, fuente: "db" };
  } catch (e) {
    creditoVistos.anteFalloPersistencia(e);
    return clientesConSaldoMemoria(hoyMs);
  }
}

function clientesConSaldoMemoria(hoyMs: number): { clientes: ClienteConSaldo[]; fuente: "memoria" } {
  const movs = crearListaMovimientosCredito()
    .listar()
    .map((m) => ({
      customerId: m.customer_id,
      debe: BigInt(m.debe),
      haber: BigInt(m.haber),
      fechaMs: typeof m.fecha_ms === "number" ? m.fecha_ms : null,
    }));
  return { clientes: agruparSaldos(movs, new Map(), hoyMs), fuente: "memoria" };
}

export { UMBRAL_MORA_DIAS };
