import { eq, sql } from "drizzle-orm";
import { getTenantDb } from "../../lib/db.js";
import { dbVivaTenant } from "../../lib/server-db.js";
import {
  cashMovements,
  products,
  sales,
  stockMovements,
  ticketCounters,
  ticketPayments,
  tickets,
} from "../../db/schema.js";
import { store, type StoredTicket } from "../../lib/store.js";
import type { Medio } from "../../lib/validation.js";
import { lotesDesdeStock, type Sku } from "../inventario/inventario.js";
import {
  vender_mostrador,
  type EfectoVenta,
  type FalloVenta,
  type TicketDefinitivo,
  type TicketEmitido,
} from "./vender_mostrador.js";

// PERS-S1 (ADR-0024): venta con DB como fuente cuando hay DB viva.
// La ruta valida y resuelve fiscal; este repo es dueño de snapshot bajo
// lock → núcleo puro → 1 tx → espejo memoria (el espejo cae en PERS-S4
// cuando el resto de dominios deje de leer store).

export interface LineaVentaInput {
  readonly product_id: string;
  readonly qty: number;
  readonly precio_centavos: number;
}

export interface PagoVentaInput {
  readonly medio: Medio;
  readonly monto_centavos: number;
}

export interface RegistrarVentaInput {
  readonly key: string;
  readonly lineas: ReadonlyArray<LineaVentaInput>;
  readonly medio: Medio;
  readonly deviceCode: string;
  readonly seqLocal: number;
  readonly offline: boolean;
  readonly pagos?: ReadonlyArray<PagoVentaInput> | undefined;
  readonly clientOccurredAt: string;
  // Puerta fiscal pura que la ruta inyecta: corre post-núcleo y pre-apply
  // para que un 422 fiscal no escriba nada (mismo orden histórico).
  readonly gateFiscal?: GateFiscal | undefined;
}

// Puerta fiscal: solo decide con el total; no persiste ni importa fiscal.
export type GateFiscal = (total: bigint) => { ok: true } | { ok: false; error: string };

export interface PagoConId {
  readonly medio: Medio;
  readonly monto_centavos: number;
  readonly cashMovementId: string;
}

export interface VentaRegistrada {
  readonly saleId: string;
  readonly efecto: EfectoVenta;
  readonly pagosConId: PagoConId[];
  readonly fuente: "db" | "memoria";
}

export type RegistroVentaFallo =
  | FalloVenta
  | { readonly ok: false; readonly codigo: "PAGOS_NO_SUMAN"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "FISCAL_RECHAZO"; readonly status: 422; readonly error: string }
  | { readonly ok: false; readonly codigo: "YA_VISTA_DB"; readonly status: 409; readonly original: unknown };

type TenantDb = ReturnType<typeof getTenantDb>;

type FilaVenta = typeof sales.$inferSelect;

// Response.json no serializa bigint: la fila sale con total en string.
function filaVentaJson(f: FilaVenta): Record<string, unknown> {
  return { ...f, totalCentavos: f.totalCentavos.toString() };
}

// PERS2-S2: la disponibilidad de DB la resuelve el helper central
// (dbVivaTenant: null en single, BaseNoDisponible en multi).

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

function esUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function aEmitido(v: StoredTicket): TicketEmitido {
  if (v.ticket_definitivo) {
    return {
      kind: "online",
      definitivo: v.ticket_definitivo as TicketDefinitivo,
      provisorio: v.ticket_provisorio,
      totalCentavos: BigInt(v.total_centavos),
      sobreventa: false,
      leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA",
      medio: v.medio,
    };
  }
  return {
    kind: "offline",
    definitivo: null,
    provisorio: v.ticket_provisorio,
    totalCentavos: BigInt(v.total_centavos),
    sobreventa: v.sobreventa,
    leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA",
    medio: v.medio,
  };
}

// Espejo memoria idéntico al apply histórico. Vive hasta PERS-S4: tickets,
// sync/promote y otros dominios aún leen store.
function espejoMemoria(
  key: string,
  saleId: string,
  i: RegistrarVentaInput,
  e: EfectoVenta,
  pagosConId: PagoConId[],
  esDividido: boolean,
): void {
  store.idempotency.set(key, {
    sale_id: saleId,
    ticket_definitivo: e.ticket.definitivo,
    ticket_provisorio: e.ticket.provisorio,
    total_centavos: e.ticket.totalCentavos.toString(),
    medio: i.medio,
    sobreventa: e.ticket.sobreventa,
  });
  for (const p of pagosConId) {
    store.movements.push({
      id: p.cashMovementId,
      tipo: "egreso",
      metodo: p.medio,
      monto_centavos: String(p.monto_centavos),
      origen: "venta",
      sale_id: saleId,
      idempotency_key: esDividido ? `${key}:${p.medio}` : key,
    });
  }
  store.ticketPagos.set(
    saleId,
    pagosConId.map((p) => ({ medio: p.medio, montoCentavos: String(p.monto_centavos), cashMovementId: p.cashMovementId })),
  );
  // PERS5-S3: el espejo se alinea al número del ticket (de memoria o de la
  // base) en vez de sumar 1: tras un reinicio no queda atrás del contador.
  if (e.ticket.definitivo) store.nextTicket = Math.max(store.nextTicket, Number(e.ticket.definitivo.slice(2)) + 1);
  if (!e.ticket.sobreventa) {
    for (const d of e.descuentos) {
      store.stock.set(d.sku, (store.stock.get(d.sku) ?? 0) - d.cantidad);
    }
  }
  for (const m of e.movimientosStock) {
    store.stockMoves.push({ idemKey: key, sku: m.sku, loteId: m.loteId, delta: m.delta, tipo: m.tipo });
  }
}

function viaMemoria(i: RegistrarVentaInput): { ok: true; venta: VentaRegistrada } | RegistroVentaFallo {
  const r = vender_mostrador({
    idempotencyKey: i.key,
    lineas: i.lineas.map((l) => ({ sku: l.product_id as Sku, cantidad: l.qty, precioCentavos: BigInt(l.precio_centavos) })),
    medio: i.medio,
    deviceCode: i.deviceCode,
    seqLocal: i.seqLocal,
    offline: i.offline,
    lotes: lotesDesdeStock(store.stock),
    vistos: new Map([...store.idempotency.entries()].map(([k, v]) => [k, aEmitido(v)] as const)),
    ultimoDefinitivo: store.nextTicket > 1 ? { n: store.nextTicket - 1 } : null,
    grant: { rol: "dueno" },
  });
  if (!r.ok) return r;
  const e = r.efecto;
  if (i.gateFiscal) {
    const g = i.gateFiscal(e.ticket.totalCentavos);
    if (!g.ok) return { ok: false, codigo: "FISCAL_RECHAZO", status: 422, error: g.error };
  }
  if (i.pagos) {
    const suma = i.pagos.reduce((a, p) => a + p.monto_centavos, 0);
    if (BigInt(suma) !== e.ticket.totalCentavos) return { ok: false, codigo: "PAGOS_NO_SUMAN", status: 422 };
  }
  const saleId = crypto.randomUUID();
  const pagosEfectivos = i.pagos ?? [{ medio: i.medio, monto_centavos: Number(e.ticket.totalCentavos) }];
  const esDividido = Boolean(i.pagos);
  const pagosConId = pagosEfectivos.map((p) => ({ ...p, cashMovementId: crypto.randomUUID() }));
  espejoMemoria(i.key, saleId, i, e, pagosConId, esDividido);
  return { ok: true, venta: { saleId, efecto: e, pagosConId, fuente: "memoria" } };
}

export async function registrar_venta(i: RegistrarVentaInput): Promise<{ ok: true; venta: VentaRegistrada } | RegistroVentaFallo> {
  const db = dbVivaTenant();
  if (!db) return viaMemoria(i);

  // 409 antes de numerar, misma respuesta que el pre-check histórico.
  try {
    const previo = await db.select().from(sales).where(eq(sales.idempotencyKey, i.key)).limit(1);
    const fila = previo[0];
    if (fila) return { ok: false, codigo: "YA_VISTA_DB", status: 409, original: filaVentaJson(fila) };
  } catch {
    return viaMemoria(i);
  }

  try {
    const salida = await db.transaction(async (tx) => {
      // Lock de secuencia: correlativo sin huecos, revierte con la tx.
      const filas = await tx.select().from(ticketCounters).where(eq(ticketCounters.id, "mostrador")).for("update");
      const ultimo = filas[0]?.ultimo ?? 0;
      // Misma semántica que memoria: niveles por sku con la misma función.
      const prods = await tx.select({ sku: products.sku, stockActual: products.stockActual }).from(products);
      const niveles = new Map(prods.map((p) => [p.sku, p.stockActual] as const));
      const r = vender_mostrador({
        idempotencyKey: i.key,
        lineas: i.lineas.map((l) => ({ sku: l.product_id as Sku, cantidad: l.qty, precioCentavos: BigInt(l.precio_centavos) })),
        medio: i.medio,
        deviceCode: i.deviceCode,
        seqLocal: i.seqLocal,
        offline: i.offline,
        lotes: lotesDesdeStock(niveles),
        vistos: new Map<string, TicketEmitido>(),
        ultimoDefinitivo: ultimo > 0 ? { n: ultimo } : null,
        grant: { rol: "dueno" },
      });
      if (!r.ok) return r;
      const e = r.efecto;
      if (i.gateFiscal) {
        const g = i.gateFiscal(e.ticket.totalCentavos);
        if (!g.ok) return { ok: false, codigo: "FISCAL_RECHAZO", status: 422, error: g.error } as const;
      }
      if (i.pagos) {
        const suma = i.pagos.reduce((a, p) => a + p.monto_centavos, 0);
        if (BigInt(suma) !== e.ticket.totalCentavos) return { ok: false, codigo: "PAGOS_NO_SUMAN", status: 422 } as const;
      }
      const saleId = crypto.randomUUID();
      const pagosEfectivos = i.pagos ?? [{ medio: i.medio, monto_centavos: Number(e.ticket.totalCentavos) }];
      const esDividido = Boolean(i.pagos);
      const pagosConId = pagosEfectivos.map((p) => ({ ...p, cashMovementId: crypto.randomUUID() }));
      // Sin onConflictDoNothing: el choque de carrera lo mapea el catch a 409.
      await tx.insert(sales).values({
        id: saleId,
        idempotencyKey: i.key,
        medio: i.medio,
        totalCentavos: e.ticket.totalCentavos,
        sobreventa: e.ticket.sobreventa,
        offline: i.offline,
        clientOccurredAt: new Date(i.clientOccurredAt),
      });
      await tx.insert(tickets).values({
        saleId,
        definitivo: e.ticket.definitivo,
        provisorio: e.ticket.provisorio,
      });
      if (e.ingresaACaja) {
        await tx.insert(cashMovements).values(
          pagosConId.map((p) => ({
            saleId,
            idempotencyKey: esDividido ? `${i.key}:${p.medio}` : i.key,
            tipo: "egreso",
            metodo: p.medio,
            categoriaId: "venta",
            origen: "venta",
            montoCentavos: BigInt(p.monto_centavos),
          })),
        );
        await tx.insert(ticketPayments).values(
          pagosConId.map((p) => ({
            saleId,
            metodo: p.medio,
            montoCentavos: BigInt(p.monto_centavos),
            cashMovementId: p.cashMovementId,
          })),
        );
      }
      if (e.movimientosStock.length > 0) {
        await tx.insert(stockMovements).values(
          e.movimientosStock.map((m) => ({
            idemKey: i.key,
            sku: m.sku,
            loteId: esUuid(m.loteId) ? m.loteId : null,
            delta: m.delta,
            tipo: m.tipo,
          })),
        );
      }
      if (!e.ticket.sobreventa) {
        for (const d of e.descuentos) {
          await tx
            .update(products)
            .set({ stockActual: sql`${products.stockActual} - ${d.cantidad}` })
            .where(eq(products.sku, d.sku));
        }
      }
      if (e.ticket.definitivo) {
        await tx.update(ticketCounters).set({ ultimo: ultimo + 1 }).where(eq(ticketCounters.id, "mostrador"));
      }
      return { ok: true as const, saleId, efecto: e, pagosConId, esDividido };
    });
    if (!salida.ok) return salida;
    espejoMemoria(i.key, salida.saleId, i, salida.efecto, salida.pagosConId, salida.esDividido);
    return { ok: true, venta: { saleId: salida.saleId, efecto: salida.efecto, pagosConId: salida.pagosConId, fuente: "db" } };
  } catch (e) {
    // Carrera entre pre-check e insert: mismo 409 con relectura del original.
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(sales).where(eq(sales.idempotencyKey, i.key)).limit(1);
        const fila = previo[0];
        return { ok: false, codigo: "YA_VISTA_DB", status: 409, original: fila ? filaVentaJson(fila) : null };
      } catch {
        return viaMemoria(i);
      }
    }
    // Caída de DB a mitad de camino: la tx revirtió; la venta no se pierde.
    return viaMemoria(i);
  }
}
