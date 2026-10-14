import { eq } from "drizzle-orm";
import { customerMovements } from "../../db/schema-credito.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant } from "../server-db.js";
import { store } from "../store.js";
import type { Medio } from "../validation.js";
import { lotesDesdeStock, type Sku } from "../../modules/inventario/inventario.js";
import { cobro_fiado, venta_a_cuenta } from "../../modules/credit/fiado.js";
import { UMBRAL_MORA_DIAS, derivar_saldo, dias_atraso } from "../../modules/credit/saldos.js";
import { registrarIngresoCobro } from "./caja.js";

// PERS2-S17 (ADR-0058): fiado (venta a cuenta, cobros, saldo por cliente).
// DB primero via dbVivaTenant(); solo en single sin base usa la memoria
// particionada. En multi sin base dbVivaTenant lanza BaseNoDisponible y se
// propaga (la ruta responde 503). Los ingresos a caja van por caja.ts.

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

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
  if (store.creditVistos.has(input.key)) {
    return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
  }
  const r = venta_a_cuenta({
    idempotencyKey: input.key,
    customerId: input.customerId,
    lineas: input.lineas.map((l) => ({ sku: l.sku as Sku, cantidad: l.qty, precioCentavos: BigInt(l.precioCentavos) })),
    deviceCode: input.deviceCode,
    seqLocal: input.seqLocal,
    offline: false,
    // Ningun repo cubre lotes FIFO: se leen de la memoria particionada.
    lotes: lotesDesdeStock(store.stock),
    vistos: new Map(),
    ultimoDefinitivo: store.nextTicket > 1 ? { n: store.nextTicket - 1 } : null,
    saldoActualCentavos: BigInt(input.saldoActualCentavos),
    topeCentavos: BigInt(input.topeCentavos),
    rol: "dueno",
    ahoraMs: Date.now(),
  });
  if (!r.ok) {
    return { ok: false, codigo: r.codigo, status: r.status as number, error: r.codigo };
  }
  const total = input.lineas.reduce((acc, l) => acc + BigInt(l.qty) * BigInt(l.precioCentavos), 0n);

  const espejoMemoria = () => {
    // Sin tabla propia: vistos y movimientos en memoria (durable via UNIQUE).
    store.creditVistos.set(input.key, { customer_id: input.customerId });
    store.creditMovs.push({ customer_id: input.customerId, debe: total.toString(), haber: "0", key: input.key, fecha_ms: Date.now() });
    // Sin tabla de numeracion en este dominio: el contador vive en memoria.
    if (r.efecto.ticket.definitivo) store.nextTicket += 1;
  };

  const db = dbVivaTenant();
  if (!db) {
    const dup = store.creditMovs.find((m) => m.key === input.key);
    if (dup) return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    espejoMemoria();
    return { ok: true, ticketDefinitivo: r.efecto.ticket.definitivo, totalCentavos: total.toString(), fuente: "memoria" };
  }

  try {
    const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, input.key)).limit(1);
    if (previo[0]) return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    await db.insert(customerMovements).values({
      customerId: input.customerId,
      tipo: "venta",
      debeCentavos: total,
      haberCentavos: 0n,
      idempotencyKey: input.key,
      clientOccurredAt: new Date(),
    });
    espejoMemoria();
    return { ok: true, ticketDefinitivo: r.efecto.ticket.definitivo, totalCentavos: total.toString(), fuente: "db" };
  } catch (e) {
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, input.key)).limit(1);
        if (previo[0]) return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
      } catch {
        // Cae al espejo memoria de abajo.
      }
      if (esModoMulti()) throw aBaseNoDisponible(e);
    } else if (esModoMulti()) {
      throw aBaseNoDisponible(e);
    }
    if (store.creditVistos.has(input.key)) {
      return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    }
    espejoMemoria();
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
  if (store.creditVistos.has(input.key)) {
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
    store.creditVistos.set(input.key, { customer_id: input.customerId });
    store.creditMovs.push({ customer_id: input.customerId, debe: "0", haber: input.montoCentavos.toString(), key: input.key });
  };

  const db = dbVivaTenant();
  if (!db) {
    const dup = store.creditMovs.find((m) => m.key === input.key);
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
      if (esModoMulti()) throw aBaseNoDisponible(e);
    } else if (esModoMulti()) {
      throw aBaseNoDisponible(e);
    }
    if (store.creditVistos.has(input.key)) {
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
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return saldoMemoria(customerId, hoyMs);
  }
}

function saldoMemoria(customerId: string, hoyMs: number): SaldoCliente {
  const movs = store.creditMovs.filter((m) => m.customer_id === customerId);
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

export { UMBRAL_MORA_DIAS };
