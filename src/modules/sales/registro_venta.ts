import { and, eq, inArray } from "drizzle-orm";
import { getTenantDb } from "../../lib/db.js";
import { insertarMovimientosCaja } from "../../lib/repos/movimientos-caja.js";
import { filaContadorTicket, whereContadorTicket } from "../../lib/repos/ticket-counters.js";
import { dondeTenant, esModoAisladoPorTenant, tenantIdAlSellar, tenantIdShared } from "../../lib/tenant-scope.js";
import { aplicarVentaLotes } from "../../lib/repos/stock.js";
import { BaseNoDisponible, dbVivaTenant } from "../../lib/server-db.js";
import {
  products,
  sales,
  stockMovements,
  ticketCounters,
  ticketPayments,
  ticketLines,
  tickets,
} from "../../db/schema.js";
import { ticketDiscounts } from "../../db/schema-tickets.js";
import { store, type StoredTicket } from "../../lib/store.js";
import { costosVigentesMemoria, costosVigentesPorSku } from "../../lib/repos/lotes.js";
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
  readonly porPeso?: boolean | undefined;
  // PRD-STOCK-01 STOCK-S2 (ADR-0106): alta al vuelo. El SKU es product_id y
  // el precio es el de la línea; acá solo llega el nombre.
  readonly alta?: { readonly nombre: string } | undefined;
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

// La tx ya insertó el alta antes de validar el núcleo; un rechazo tiene que
// relanzar para que la tx revierta y no quede un producto sin venta.
class VentaRechazada extends Error {
  constructor(readonly fallo: RegistroVentaFallo) {
    super("venta rechazada");
  }
}

type TenantDb = ReturnType<typeof getTenantDb>;

type FilaVenta = typeof sales.$inferSelect;

// Response.json no serializa bigint: la fila sale con total en string.
function filaVentaJson(f: FilaVenta): Record<string, unknown> {
  return { ...f, totalCentavos: f.totalCentavos.toString() };
}

// PERS2-S2: la disponibilidad de DB la resuelve el helper central
// (dbVivaTenant: null en single, BaseNoDisponible en multi).

// postgres.js anida el 23505 en cause. Si no se ve, la carrera cae a memoria.
function esConflictoUnico(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur; i++) {
    if (typeof cur === "object" && cur !== null && "code" in cur && (cur as { code: unknown }).code === "23505") return true;
    cur = typeof cur === "object" && cur !== null && "cause" in cur ? (cur as { cause?: unknown }).cause : undefined;
  }
  return false;
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
  costos: ReadonlyMap<string, bigint>,
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
      tipo: "ingreso",
      metodo: p.medio,
      monto_centavos: String(p.monto_centavos),
      origen: "venta",
      sale_id: saleId,
      idempotency_key: esDividido ? `${key}:${p.medio}` : key,
      // CAJA-S1: instante de ocurrencia para asociar QR ±15 min.
      ocurrido_en: new Date().toISOString(),
    });
  }
  store.ticketPagos.set(
    saleId,
    pagosConId.map((p) => ({ medio: p.medio, montoCentavos: String(p.monto_centavos), cashMovementId: p.cashMovementId })),
  );
  for (const l of e.lineasConDescuento) {
    const linea = i.lineas[l.idx];
    if (!linea) continue;
    const costo = costos.get(l.sku) ?? 0n;
    store.ticketLineas.push({
      sale_id: saleId,
      product_id: linea.product_id,
      qty: l.cantidad,
      precio_centavos: String(linea.precio_centavos),
      costo_centavos: costo.toString(),
    });
    store.ticketDescuentos.push({
      sale_id: saleId,
      linea_idx: l.idx,
      sku: l.sku,
      bruto_centavos: l.brutoCentavos.toString(),
      desc_linea_centavos: l.descLineaCentavos.toString(),
      desc_ticket_centavos: l.descTicketCentavos.toString(),
      neto_centavos: l.netoCentavos.toString(),
    });
  }
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

// ADR-0106: un producto dado de alta al vender sigue "sin stock inicial"
// hasta su primer movimiento ALTA; mientras tanto no bloquea el mostrador en
// línea (su faltante va como sobreventa), venga o no la línea con `alta`:
// la segunda venta ya lo encuentra en el catálogo y no manda `alta`.
function skusSinStockInicialMemoria(lineas: ReadonlyArray<LineaVentaInput>): Set<string> {
  const conAlta = new Set(store.stockMoves.filter((m) => m.tipo === "ALTA").map((m) => m.sku));
  const skus = new Set<string>();
  for (const l of lineas) {
    const sku = l.product_id;
    const nuevo = Boolean(l.alta) && !store.productos.has(sku) && !store.stock.has(sku);
    if ((nuevo || store.altasAlVender.has(sku)) && !conAlta.has(sku)) skus.add(sku);
  }
  return skus;
}

// ADR-0106: espejo del alta al vuelo sin DB, igual que el espejo de
// altaProducto (productos, stock, precios y sector). Solo agrega lo que falta:
// un SKU existente conserva nombre y precio (first-writer-wins por SKU).
// Corre recién con la venta aprobada para no dejar productos de ventas fallidas.
function espejarAltaMemoria(lineas: ReadonlyArray<LineaVentaInput>): void {
  for (const l of lineas) {
    if (!l.alta) continue;
    const sku = l.product_id;
    if (!store.productos.has(sku) && !store.stock.has(sku)) {
      store.altasAlVender.add(sku);
      store.productos.set(sku, {
        sku,
        nombre: l.alta.nombre,
        precioCentavos: l.precio_centavos,
        sector: "general",
        locationId: null,
        archivado: false,
        controlaVencimiento: false,
        estado: "activo",
        minStock: null,
        reorderQty: null,
      });
    }
    if (!store.stock.has(sku)) store.stock.set(sku, 0);
    if (!store.prices.has(sku)) store.prices.set(sku, l.precio_centavos);
    if (!store.productSectores.has(sku)) store.productSectores.set(sku, "general");
  }
}

function viaMemoria(i: RegistrarVentaInput): { ok: true; venta: VentaRegistrada } | RegistroVentaFallo {
  const skusSinStockInicial = skusSinStockInicialMemoria(i.lineas);
  const lotes = lotesDesdeStock(store.stock);
  const costos = costosVigentesMemoria();
  const r = vender_mostrador({
    idempotencyKey: i.key,
    lineas: i.lineas.map((l) => ({
      sku: l.product_id as Sku,
      cantidad: l.qty,
      precioCentavos: BigInt(l.precio_centavos),
      porPeso: l.porPeso,
    })),
    medio: i.medio,
    deviceCode: i.deviceCode,
    seqLocal: i.seqLocal,
    offline: i.offline,
    lotes,
    vistos: new Map([...store.idempotency.entries()].map(([k, v]) => [k, aEmitido(v)] as const)),
    ultimoDefinitivo: store.nextTicket > 1 ? { n: store.nextTicket - 1 } : null,
    grant: { rol: "dueno" },
    skusSinStockInicial,
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
  espejarAltaMemoria(i.lineas);
  espejoMemoria(i.key, saleId, i, e, pagosConId, esDividido, costos);
  return { ok: true, venta: { saleId, efecto: e, pagosConId, fuente: "memoria" } };
}

// AUD-VTA-02: con base viva, una falla a mitad de camino en multi/shared no
// confirma la venta en memoria (otra instancia no la ve y el stock de la base
// no baja). Lanza BaseNoDisponible y la ruta responde 503 para que la caja
// reintente. En single el respaldo en memoria sigue como antes.
function caidaDeBase(i: RegistrarVentaInput): { ok: true; venta: VentaRegistrada } | RegistroVentaFallo {
  if (esModoAisladoPorTenant()) throw new BaseNoDisponible();
  return viaMemoria(i);
}

export async function registrar_venta(i: RegistrarVentaInput): Promise<{ ok: true; venta: VentaRegistrada } | RegistroVentaFallo> {
  const db = dbVivaTenant();
  if (!db) return viaMemoria(i);
  const tenantId = tenantIdAlSellar();
  if (!tenantId) return viaMemoria(i);

  // 409 antes de numerar, misma respuesta que el pre-check histórico.
  // La key es única en toda la base. Sin el filtro, el 409 devolvería la venta de otro comercio.
  try {
    const previo = await db
      .select()
      .from(sales)
      .where(dondeTenant(sales.tenantId, eq(sales.idempotencyKey, i.key)))
      .limit(1);
    const fila = previo[0];
    if (fila) return { ok: false, codigo: "YA_VISTA_DB", status: 409, original: filaVentaJson(fila) };
  } catch {
    return caidaDeBase(i);
  }

  let costos: ReadonlyMap<string, bigint>;
  try {
    costos = await costosVigentesPorSku();
  } catch {
    costos = costosVigentesMemoria();
  }

  try {
    const salida = await db.transaction(async (tx) => {
      // Lock de secuencia: correlativo sin huecos, revierte con la tx.
      let filas = await tx.select().from(ticketCounters).where(whereContadorTicket("mostrador")).for("update");
      if (!filas[0] && tenantId) {
        await tx.insert(ticketCounters).values(filaContadorTicket("mostrador", 0)).onConflictDoNothing();
        filas = await tx.select().from(ticketCounters).where(whereContadorTicket("mostrador")).for("update");
      }
      const ultimo = filas[0]?.ultimo ?? 0;
      // ADR-0106: el alta entra en la MISMA tx y antes del snapshot. Si el SKU
      // ya existe no lo pisa; la línea con alta no bloquea por stock inicial 0.
      const skusSinStockInicial = new Set<string>();
      for (const linea of i.lineas) {
        if (!linea.alta) continue;
        const insertado = await tx
          .insert(products)
          .values({
            sku: linea.product_id,
            nombre: linea.alta.nombre,
            precioCentavos: BigInt(linea.precio_centavos),
            stockActual: 0,
            origen: "alta_al_vender",
            tenantId,
          })
          .onConflictDoNothing({ target: [products.tenantId, products.sku] })
          .returning({ id: products.id });
        if (insertado.length > 0) skusSinStockInicial.add(linea.product_id);
      }
      // Provisorios ya creados (origen alta_al_vender) sin ALTA todavía.
      const skusLinea = [...new Set(i.lineas.map((l) => l.product_id))];
      // AUD-VTA-01: catálogo y movimientos filtrados por comercio; el mismo
      // SKU en otro comercio no cuenta como provisorio ni como ALTA propia.
      const provisorios = await tx
        .select({ sku: products.sku })
        .from(products)
        .where(dondeTenant(products.tenantId, and(inArray(products.sku, skusLinea), eq(products.origen, "alta_al_vender"))));
      if (provisorios.length > 0) {
        const wAlta = and(inArray(stockMovements.sku, provisorios.map((p) => p.sku)), eq(stockMovements.tipo, "ALTA"));
        const conAlta = await tx
          .select({ sku: stockMovements.sku })
          .from(stockMovements)
          .where(dondeTenant(stockMovements.tenantId, wAlta));
        const yaCargados = new Set(conAlta.map((m) => m.sku));
        for (const p of provisorios) if (!yaCargados.has(p.sku)) skusSinStockInicial.add(p.sku);
      }
      // P1-60: el corte de vencido es el instante de la venta.
      const ahora = new Date(i.clientOccurredAt);
      return aplicarVentaLotes(tx, { skus: skusLinea, offline: i.offline, ahora }, async (lotes) => {
        // AUD-VTA-01: la línea del ticket apunta al producto de este comercio.
        const prods = await tx
          .select({ id: products.id, sku: products.sku })
          .from(products)
          .where(dondeTenant(products.tenantId, inArray(products.sku, skusLinea)));
        const idPorSku = new Map(prods.map((p) => [p.sku, p.id] as const));
        const r = vender_mostrador({
          idempotencyKey: i.key,
          lineas: i.lineas.map((l) => ({
      sku: l.product_id as Sku,
      cantidad: l.qty,
      precioCentavos: BigInt(l.precio_centavos),
      porPeso: l.porPeso,
    })),
          medio: i.medio,
          deviceCode: i.deviceCode,
          seqLocal: i.seqLocal,
          offline: i.offline,
          lotes,
          vistos: new Map<string, TicketEmitido>(),
          ultimoDefinitivo: ultimo > 0 ? { n: ultimo } : null,
          grant: { rol: "dueno" },
          skusSinStockInicial,
        });
        if (!r.ok) throw new VentaRechazada(r);
        const e = r.efecto;
        if (i.gateFiscal) {
          const g = i.gateFiscal(e.ticket.totalCentavos);
          if (!g.ok) throw new VentaRechazada({ ok: false, codigo: "FISCAL_RECHAZO", status: 422, error: g.error });
        }
        if (i.pagos) {
          const suma = i.pagos.reduce((a, p) => a + p.monto_centavos, 0);
          if (BigInt(suma) !== e.ticket.totalCentavos) {
            throw new VentaRechazada({ ok: false, codigo: "PAGOS_NO_SUMAN", status: 422 });
          }
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
          clientOccurredAt: ahora,
          tenantId,
        });
        await tx.insert(tickets).values({
          saleId,
          definitivo: e.ticket.definitivo,
          provisorio: e.ticket.provisorio,
          tenantId,
        });
        // P10-16 GP4: costo congelado por SKU, calculado antes de la tx.
        const lineasDb = e.lineasConDescuento.flatMap((l) => {
          const linea = i.lineas[l.idx];
          if (!linea) return [];
          const productId = esUuid(linea.product_id) ? linea.product_id : idPorSku.get(linea.product_id);
          if (!productId) return [];
          const costo = costos.get(l.sku) ?? 0n;
          return [{
            saleId,
            productId,
            qty: l.cantidad,
            precioCentavos: BigInt(linea.precio_centavos),
            costoCentavos: costo,
            tenantId,
          }];
        });
        if (lineasDb.length > 0) await tx.insert(ticketLines).values(lineasDb);
        await tx.insert(ticketDiscounts).values(
          e.lineasConDescuento.map((l) => ({
            saleId,
            lineaIdx: l.idx,
            sku: l.sku,
            brutoCentavos: l.brutoCentavos,
            descLineaCentavos: l.descLineaCentavos,
            descTicketCentavos: l.descTicketCentavos,
            netoCentavos: l.netoCentavos,
          })),
        );
        if (e.ingresaACaja) {
          await insertarMovimientosCaja(
            tx,
            pagosConId.map((p) => ({
              id: p.cashMovementId,
              saleId,
              idempotencyKey: esDividido ? `${i.key}:${p.medio}` : i.key,
              tipo: "ingreso",
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
              tenantId,
            })),
          );
        }
        if (e.ticket.definitivo) {
          await tx.update(ticketCounters).set({ ultimo: ultimo + 1 }).where(whereContadorTicket("mostrador"));
        }
        return {
          consumo: {
            idemKey: i.key,
            tomas: e.descuentos.map((d) => ({ loteId: d.loteId, sku: d.sku, cantidad: d.cantidad })),
          // P1-60: la sobreventa offline anota lo tomado y no baja cantidades.
          bajarCantidades: !e.ticket.sobreventa,
          },
          valor: { ok: true as const, saleId, efecto: e, pagosConId, esDividido },
        };
      });
    });
    espejoMemoria(i.key, salida.saleId, i, salida.efecto, salida.pagosConId, salida.esDividido, costos);
    return { ok: true, venta: { saleId: salida.saleId, efecto: salida.efecto, pagosConId: salida.pagosConId, fuente: "db" } };
  } catch (e) {
    if (e instanceof VentaRechazada) return e.fallo;
    // Carrera entre pre-check e insert: mismo 409 con relectura del original.
    if (esConflictoUnico(e)) {
      try {
        const previo = await db
          .select()
          .from(sales)
          .where(dondeTenant(sales.tenantId, eq(sales.idempotencyKey, i.key)))
          .limit(1);
        const fila = previo[0];
        return { ok: false, codigo: "YA_VISTA_DB", status: 409, original: fila ? filaVentaJson(fila) : null };
      } catch {
        return caidaDeBase(i);
      }
    }
    // AUD-VTA-02: caída de DB a mitad de camino; la tx revirtió. Single cae
    // a memoria; multi/shared responde 503.
    return caidaDeBase(i);
  }
}
