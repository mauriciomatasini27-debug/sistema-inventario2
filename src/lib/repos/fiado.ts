import { asc, eq, sql } from "drizzle-orm";
import { customerMovements, customers } from "../../db/schema-credito.js";
import { insertarMovimientosCaja } from "./movimientos-caja.js";
import {
  SERIE_MOSTRADOR,
  products,
  sales,
  ticketCounters,
  ticketLines,
  tickets,
} from "../../db/schema.js";
import { agregarDescuentoTicket, agregarLineaTicket, agregarStockMoveMemoria, guardarTicketFiado } from "../ticket-memoria.js";
import { ticketDiscounts } from "../../db/schema-tickets.js";
import { BaseNoDisponible, dbVivaTenant, intentarLeer } from "../server-db.js";
import { tenantActual } from "../tenant-mode.js";
import { tenantIdShared } from "../tenant-scope.js";
import {
  crearAlmacenCreditoVistos,
  crearAlmacenStock,
  crearContadorTickets,
  crearListaMovimientosCredito,
} from "./_almacen.js";
import type { Medio } from "../validation.js";
import type { Sku } from "../../modules/inventario/inventario.js";
import type { Rol } from "../../modules/cash/caja.js";
import {
  CODIGO_CONFIRMACION_EXCESO,
  cobro_fiado,
  venta_a_cuenta,
  type ConfirmacionExceso,
  type EfectoFiado,
} from "../../modules/credit/fiado.js";
import { disponibleDesdeLimite, limiteDesdeFicha, resolverCredito } from "../../modules/credit/limite.js";
import { aplicarVentaLotes } from "./stock.js";
import { UMBRAL_MORA_DIAS, derivar_saldo, dias_atraso, situacion_mora, type SituacionMora } from "../../modules/credit/saldos.js";
import { PLAZO_DEFECTO_DIAS, crear_cliente } from "../../modules/credit/clientes.js";
import { registrarIngresoCobro } from "./caja.js";
import { costosVigentesMemoria, costosVigentesPorSku } from "./lotes.js";

// PERS2-S17 (ADR-0058): fiado (venta a cuenta, cobros, saldo por cliente).

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
  readonly rol: Rol;
  readonly confirmacion: ConfirmacionExceso;
}

export type VentaACuentaResultado =
  | { ok: true; ticketDefinitivo: string | null; totalCentavos: string; fuente: "db"; superaMora: boolean; superaTope: boolean }
  | { ok: false; codigo: "TOPE_SUPERADO"; status: 403; error: string; disponibleCentavos: bigint }
  | { ok: false; codigo: "MORA"; status: 403; error: string; diasMax: number }
  | {
      ok: false;
      codigo: typeof CODIGO_CONFIRMACION_EXCESO;
      status: 403;
      error: string;
      superaTope: boolean;
      superaMora: boolean;
      disponibleCentavos: bigint | null;
      diasMax: number | null;
    }
  | { ok: false; codigo: string; status: number; error: string };

function esUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

class FiadoRechazado extends Error {
  constructor(readonly resultado: Extract<VentaACuentaResultado, { ok: false }>) {
    super("fiado rechazado");
  }
}

// FC2/C18: descuenta stock, suma fiado, cero caja. Clave repetida => 409.
export async function ventaACuenta(input: VentaACuentaInput): Promise<VentaACuentaResultado> {
  const creditoVistos = crearAlmacenCreditoVistos();
  const movsCredito = crearListaMovimientosCredito();
  const contadorTickets = crearContadorTickets();
  const almacenStock = crearAlmacenStock();
  if (creditoVistos.contiene(input.key)) {
    return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
  }
  const total = input.lineas.reduce((acc, l) => acc + BigInt(l.qty) * BigInt(l.precioCentavos), 0n);
  const lineasNucleo = input.lineas.map((l) => ({ sku: l.sku as Sku, cantidad: l.qty, precioCentavos: BigInt(l.precioCentavos) }));

  // P10-16 GP4: costo unitario vigente por SKU para congelarlo en la línea.
  const costos = costosVigentesMemoria();

  const espejoMemoria = (efecto: EfectoFiado, ticket: string | null, siguiente: number | null, saleId: string) => {
    // Sin tabla propia: vistos y movimientos en memoria (durable via UNIQUE).
    creditoVistos.guardar(input.key, { customer_id: input.customerId });
    movsCredito.agregar({ customer_id: input.customerId, debe: total.toString(), haber: "0", key: input.key, fecha_ms: Date.now() });
    // P10-2: ticket y stock consultables también sin base.
    guardarTicketFiado(saleId, {
      sale_id: saleId,
      ticket_definitivo: efecto.ticket.definitivo,
      ticket_provisorio: efecto.ticket.provisorio,
      total_centavos: total.toString(),
      medio: "A cuenta",
      sobreventa: efecto.faltantes.length > 0,
      idempotency_key: input.key,
    });
    for (const l of input.lineas) {
      const costo = costos.get(l.sku) ?? 0n;
      agregarLineaTicket({
        sale_id: saleId,
        product_id: l.sku,
        qty: l.qty,
        precio_centavos: String(l.precioCentavos),
        costo_centavos: costo.toString(),
      });
    }
    for (const d of efecto.lineasConDescuento) {
      agregarDescuentoTicket({
        sale_id: saleId,
        linea_idx: d.idx,
        sku: d.sku,
        bruto_centavos: d.brutoCentavos.toString(),
        desc_linea_centavos: d.descLineaCentavos.toString(),
        desc_ticket_centavos: d.descTicketCentavos.toString(),
        neto_centavos: d.netoCentavos.toString(),
      });
    }
    const stock = almacenStock.mapaVivo();
    for (const d of efecto.descuentos) {
      stock.set(d.sku, (stock.get(d.sku) ?? 0) - d.cantidad);
    }
    for (const m of efecto.movimientosStock) {
      agregarStockMoveMemoria({ idemKey: input.key, sku: m.sku, loteId: m.loteId, delta: m.delta, tipo: m.tipo });
    }
    // Espejo del correlativo T-*: en memoria avanza de a uno; con base viva
    // se alinea al número dado por ticket_counters (PERS5-S3).
    if (ticket) {
      const actual = contadorTickets.leer();
      contadorTickets.fijar(siguiente !== null ? Math.max(actual, siguiente) : actual + 1);
    }
  };

  const db = dbVivaTenant();
  if (!db) {
    return { ok: false, codigo: "CLIENTE_DESCONOCIDO", status: 404, error: "CLIENTE_DESCONOCIDO" };
  }
  const tenantId = tenantIdShared();

  let costosDb: ReadonlyMap<string, bigint>;
  try {
    costosDb = await costosVigentesPorSku();
  } catch {
    costosDb = costos;
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
      if (!esUuid(input.customerId)) {
        throw new FiadoRechazado({ ok: false, codigo: "CLIENTE_DESCONOCIDO", status: 404, error: "CLIENTE_DESCONOCIDO" });
      }
      const fichas = await tx
        .select({ id: customers.id, tope: customers.topeCentavos })
        .from(customers)
        .where(eq(customers.id, input.customerId))
        .for("update")
        .limit(1);
      const ficha = fichas[0];
      if (!ficha) {
        throw new FiadoRechazado({ ok: false, codigo: "CLIENTE_DESCONOCIDO", status: 404, error: "CLIENTE_DESCONOCIDO" });
      }
      // P1-66: saldoCliente abre otra lectura y, si falla, cae a memoria.
      // El saldo y la mora salen de estas filas, con el cliente ya bloqueado.
      const filasMov = await tx
        .select({
          debe: customerMovements.debeCentavos,
          haber: customerMovements.haberCentavos,
          ocurridoEn: customerMovements.clientOccurredAt,
        })
        .from(customerMovements)
        .where(eq(customerMovements.customerId, input.customerId));
      const saldoCentavos = derivar_saldo(
        filasMov.map((f) => ({ debeCentavos: BigInt(f.debe), haberCentavos: BigInt(f.haber) })),
      );
      const credito = resolverCredito({
        customerId: input.customerId,
        topeAlmacenado: ficha.tope,
        saldoCentavos,
        rol: input.rol,
      });
      if (!credito.ok) {
        throw new FiadoRechazado({ ok: false, codigo: credito.codigo, status: credito.status, error: credito.codigo });
      }
      const ahora = new Date();
      const mora = situacion_mora(
        filasMov.flatMap((f) => (BigInt(f.debe) > 0n ? [{ fecha: new Date(f.ocurridoEn).getTime() }] : [])),
        saldoCentavos,
        ahora.getTime(),
      );
      return aplicarVentaLotes(tx, {
        skus: input.lineas.map((l) => l.sku),
        offline: false,
        ahora,
      }, async (lotes) => {
        const r = venta_a_cuenta({
          idempotencyKey: input.key,
          lineas: lineasNucleo,
          deviceCode: input.deviceCode,
          seqLocal: input.seqLocal,
          offline: false,
          lotes,
          vistos: new Map(),
          ultimoDefinitivo: ultimo > 0 ? { n: ultimo } : null,
          credito: credito.valor,
          ahoraMs: ahora.getTime(),
          mora,
          confirmacion: input.confirmacion,
        });
        if (!r.ok) {
          if (r.codigo === CODIGO_CONFIRMACION_EXCESO) {
            // P1-67: el throw sale antes del insert. La tx no deja la clave.
            throw new FiadoRechazado({
              ok: false,
              codigo: CODIGO_CONFIRMACION_EXCESO,
              status: r.status,
              error: CODIGO_CONFIRMACION_EXCESO,
              superaTope: r.superaTope,
              superaMora: r.superaMora,
              disponibleCentavos: r.disponibleCentavos,
              diasMax: r.diasMax,
            });
          }
          if (r.codigo === "TOPE_SUPERADO") {
            throw new FiadoRechazado({
              ok: false,
              codigo: "TOPE_SUPERADO",
              status: 403,
              error: "TOPE_SUPERADO",
              disponibleCentavos: r.disponibleCentavos,
            });
          }
          if (r.codigo === "MORA") {
            throw new FiadoRechazado({
              ok: false,
              codigo: "MORA",
              status: 403,
              error: "MORA",
              diasMax: r.diasMax,
            });
          }
          throw new FiadoRechazado({ ok: false, codigo: r.codigo, status: r.status, error: r.codigo });
        }
        const ticket = r.efecto.ticket.kind === "online" ? r.efecto.ticket.definitivo : null;
        const n = ticket ? ultimo + 1 : ultimo;
        const saleId = crypto.randomUUID();
        const prods = await tx.select({ id: products.id, sku: products.sku }).from(products);
        const idPorSku = new Map(prods.map((p) => [p.sku, p.id] as const));
        await tx.insert(customerMovements).values({
          customerId: input.customerId,
          tipo: "venta",
          debeCentavos: total,
          haberCentavos: 0n,
          saleId,
          idempotencyKey: input.key,
          clientOccurredAt: ahora,
        });
        await tx.insert(sales).values({
          id: saleId,
          idempotencyKey: input.key,
          medio: "A cuenta",
          totalCentavos: total,
          sobreventa: r.efecto.faltantes.length > 0,
          offline: false,
          clientOccurredAt: ahora,
          ...(tenantId ? { tenantId } : {}),
        });
        await tx.insert(tickets).values({
          saleId,
          definitivo: ticket,
          provisorio: r.efecto.ticket.provisorio,
          ...(tenantId ? { tenantId } : {}),
        });
        // P10-16 GP4: costo congelado por SKU, calculado antes de la tx.
        const lineasDb = input.lineas.flatMap((l) => {
          const productId = idPorSku.get(l.sku);
          if (!productId) return [];
          const costo = costosDb.get(l.sku) ?? 0n;
          return [{ saleId, productId, qty: l.qty, precioCentavos: BigInt(l.precioCentavos), costoCentavos: costo }];
        });
        if (lineasDb.length > 0) await tx.insert(ticketLines).values(lineasDb);
        // P10-16: snapshot por línea en ticket_discounts, misma tx que la venta.
        await tx.insert(ticketDiscounts).values(
          r.efecto.lineasConDescuento.map((l) => ({
            saleId,
            lineaIdx: l.idx,
            sku: l.sku,
            brutoCentavos: l.brutoCentavos,
            descLineaCentavos: l.descLineaCentavos,
            descTicketCentavos: l.descTicketCentavos,
            netoCentavos: l.netoCentavos,
          })),
        );
        if (ticket) await tx.update(ticketCounters).set({ ultimo: n }).where(eq(ticketCounters.id, SERIE_MOSTRADOR));
        return {
          consumo: {
            idemKey: input.key,
            tomas: r.efecto.descuentos.map((d) => ({ loteId: d.loteId, sku: d.sku, cantidad: d.cantidad })),
            // P1-60: fiado no deja la venta en sobreventa; siempre baja lo tomado.
            bajarCantidades: true,
          },
          valor: { estado: "ok" as const, ticket, n, saleId, efecto: r.efecto },
        };
      });
    });
    if (salida.estado === "repetida") {
      return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    }
    espejoMemoria(salida.efecto, salida.ticket, salida.n + 1, salida.saleId);
    return {
      ok: true,
      ticketDefinitivo: salida.ticket,
      totalCentavos: total.toString(),
      fuente: "db",
      superaMora: salida.efecto.superaMora,
      superaTope: salida.efecto.superaTope,
    };
  } catch (e) {
    if (e instanceof FiadoRechazado) return e.resultado;
    if (esConflictoUnico(e)) {
      const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, input.key)).limit(1);
      if (previo[0]) return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
    }
    throw e;
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
// relectura; con base viva, cobro e ingreso entran en la misma transacción.
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
    await db.transaction(async (tx) => {
      await tx.insert(customerMovements).values({
        customerId: input.customerId,
        tipo: "cobro",
        debeCentavos: 0n,
        haberCentavos: input.montoCentavos,
        idempotencyKey: input.key,
        clientOccurredAt: new Date(),
      });
      await insertarMovimientosCaja(tx, [{
        id: crypto.randomUUID(),
        idempotencyKey: input.key,
        tipo: "ingreso",
        metodo: input.medio,
        categoriaId: "cobro_fiado",
        origen: "cobro_fiado",
        montoCentavos: input.montoCentavos,
      }]);
    });
    espejoCredito();
    return { ok: true, customerId: input.customerId, haberCentavos: input.montoCentavos.toString(), fuente: "db" };
  } catch (e) {
    // P10-15: credito y caja entran en la misma tx. Si la tx no commitea, la
    // unica salida es 409 por la clave ya persistida o propagar el error; un
    // espejo de memoria con la caja escrita aparte deja las dos mitades
    // separadas y responde 201 sin haber cobrado.
    if (!esConflictoUnico(e)) throw e;
    const previo = await db.select().from(customerMovements).where(eq(customerMovements.idempotencyKey, input.key)).limit(1);
    if (!previo[0]) throw e;
    return { ok: false, codigo: "idempotency-key repetida", status: 409, error: "idempotency-key repetida" };
  }
}

export interface SaldoCliente {
  readonly saldoCentavos: string;
  readonly diasMax: number;
  readonly mora: SituacionMora;
  readonly fuente: "db" | "memoria";
  readonly existe: boolean;
  readonly sinTope: boolean;
  readonly topeCentavos: string | null;
  readonly disponibleCentavos: string | null;
}

const PREVIEW_SIN_FICHA = {
  existe: false,
  sinTope: true,
  topeCentavos: null,
  disponibleCentavos: null,
} as const;

function previewDeTope(
  tope: bigint,
  saldo: bigint,
): Pick<SaldoCliente, "existe" | "sinTope" | "topeCentavos" | "disponibleCentavos"> {
  const limite = limiteDesdeFicha(tope);
  if ("ok" in limite) {
    return { existe: true, sinTope: false, topeCentavos: tope.toString(), disponibleCentavos: null };
  }
  const libre = disponibleDesdeLimite(saldo, limite);
  return {
    existe: true,
    sinTope: limite.kind === "abierto",
    topeCentavos: tope.toString(),
    disponibleCentavos: libre === null ? null : libre.toString(),
  };
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
    const mora = situacion_mora(
      filas.flatMap((f) => (BigInt(f.debe) > 0n ? [{ fecha: new Date(f.ocurridoEn).getTime() }] : [])),
      saldo,
      hoyMs,
    );
    let preview: Pick<SaldoCliente, "existe" | "sinTope" | "topeCentavos" | "disponibleCentavos"> = PREVIEW_SIN_FICHA;
    if (esUuid(customerId)) {
      const fichas = await db
        .select({ tope: customers.topeCentavos })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      const ficha = fichas[0];
      if (ficha) preview = previewDeTope(ficha.tope, saldo);
    }
    return { saldoCentavos: saldo.toString(), diasMax: mora.diasMax, mora, fuente: "db", ...preview };
  } catch (e) {
    creditoVistos.anteFalloPersistencia(e);
    return saldoMemoria(customerId, hoyMs);
  }
}

function saldoMemoria(customerId: string, hoyMs: number): SaldoCliente {
  const movs = crearListaMovimientosCredito().listar().filter((m) => m.customer_id === customerId);
  const saldo = derivar_saldo(movs.map((m) => ({ debeCentavos: BigInt(m.debe), haberCentavos: BigInt(m.haber) })));
  const mora = situacion_mora(
    movs.flatMap((m) => (BigInt(m.debe) > 0n && typeof m.fecha_ms === "number" ? [{ fecha: m.fecha_ms }] : [])),
    saldo,
    hoyMs,
  );
  return { saldoCentavos: saldo.toString(), diasMax: mora.diasMax, mora, fuente: "memoria", ...PREVIEW_SIN_FICHA };
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

export interface ClienteLista {
  readonly customerId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly dni: string | null;
  readonly topeCentavos: string;
  readonly plazoDias: number;
}

// P3-7d (ADR-0020): listado read-only para el picker de fiado. DB primero con
// intentarLeer (ficha de customers); en single sin base cae a la memoria
// particionada, donde solo hay id de cliente en los movimientos, igual que
// listarClientesConSaldo. En multi sin base propaga BaseNoDisponible (503).
export async function listarClientes(): Promise<{ clientes: ClienteLista[]; fuente: "db" | "memoria" }> {
  const enDb = await intentarLeer(async (db) => {
    const filas = await db
      .select({
        id: customers.id,
        nombre: customers.nombre,
        telefono: customers.telefono,
        dni: customers.dni,
        tope: customers.topeCentavos,
        plazo: customers.plazoDias,
      })
      .from(customers)
      .orderBy(asc(customers.nombre));
    return filas.map((f) => ({
      customerId: String(f.id),
      nombre: f.nombre,
      telefono: f.telefono,
      dni: f.dni,
      topeCentavos: BigInt(f.tope).toString(),
      plazoDias: f.plazo,
    }));
  });
  if (enDb !== null) return { clientes: enDb, fuente: "db" };
  return { clientes: clientesListaMemoria(), fuente: "memoria" };
}

function clientesListaMemoria(): ClienteLista[] {
  const vistos = new Set<string>();
  const clientes: ClienteLista[] = [];
  for (const m of crearListaMovimientosCredito().listar()) {
    if (vistos.has(m.customer_id)) continue;
    vistos.add(m.customer_id);
    clientes.push({
      customerId: m.customer_id,
      nombre: m.customer_id,
      telefono: null,
      dni: null,
      topeCentavos: "0",
      plazoDias: PLAZO_DEFECTO_DIAS,
    });
  }
  return clientes.sort((a, b) => (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0));
}

export interface AltaClienteRapidaInput {
  readonly nombre: string;
  readonly telefono: string;
}

export type AltaClienteRapidaResultado =
  | { readonly ok: true; readonly customerId: string; readonly nombre: string }
  | { readonly ok: false; readonly codigo: "FICHA_INVALIDA"; readonly status: 422; readonly error: string }
  | {
      readonly ok: false;
      readonly codigo: "DUPLICADO";
      readonly status: 409;
      readonly error: string;
      readonly existente: { readonly customerId: string; readonly nombre: string };
    };

interface FichaAltaVista {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly dni: string | null;
}

// P1-64: el duplicado es un OR de nombre y teléfono, y no hay UNIQUE.
// El lock es por comercio para que el segundo alta vea la fila del primero.
// cliente.id es un uuid de dominio. customers.id lo pone la base.
export async function altaClienteRapida(input: AltaClienteRapidaInput): Promise<AltaClienteRapidaResultado> {
  const db = dbVivaTenant();
  if (!db) throw new BaseNoDisponible();
  const clave = "p1-64-alta-cliente:" + (tenantActual() ?? "");
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${clave}))`);
    const filas = await tx
      .select({
        id: customers.id,
        nombre: customers.nombre,
        telefono: customers.telefono,
        dni: customers.dni,
      })
      .from(customers)
      .orderBy(asc(customers.nombre), asc(customers.id));
    const fichas: FichaAltaVista[] = filas.map((f) => ({
      id: String(f.id),
      nombre: f.nombre,
      telefono: f.telefono,
      dni: f.dni,
    }));
    const decidido = crear_cliente({ nombre: input.nombre, telefono: input.telefono }, fichas);
    if (!decidido.ok && decidido.codigo === "DUPLICADO") {
      return {
        ok: false,
        codigo: "DUPLICADO",
        status: 409,
        error: decidido.error,
        existente: { customerId: decidido.existente.id, nombre: decidido.existente.nombre },
      };
    }
    if (!decidido.ok && decidido.codigo === "FICHA_INVALIDA") {
      return { ok: false, codigo: "FICHA_INVALIDA", status: 422, error: decidido.error };
    }
    if (!decidido.ok) throw new Error("alta rapida no pide tope");
    const insertadas = await tx
      .insert(customers)
      .values({
        nombre: decidido.cliente.nombre,
        telefono: decidido.cliente.telefono,
        dni: decidido.cliente.dni,
        notas: decidido.cliente.notas,
        topeCentavos: decidido.cliente.topeCentavos,
        plazoDias: decidido.cliente.plazoDias,
      })
      .returning({ id: customers.id });
    const id = insertadas[0]?.id;
    if (!id) throw new Error("customers.insert sin returning");
    return { ok: true, customerId: String(id), nombre: decidido.cliente.nombre };
  });
}

export { UMBRAL_MORA_DIAS };
