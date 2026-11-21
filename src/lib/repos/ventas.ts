import { and, eq, sql } from "drizzle-orm";
import { products, sales, SERIE_DEVOLUCION, stockMovements, ticketCounters, ticketLines } from "../../db/schema.js";
import { filaContadorTicket, whereContadorTicket } from "./ticket-counters.js";
import { dondeTenant, filaConTenant } from "../tenant-scope.js";
import { saleReturns, ticketPaymentCorrections } from "../../db/schema-tickets.js";
import { customerMovements } from "../../db/schema-credito.js";
import { dbVivaTenant } from "../server-db.js";
import { listarLineasTicket, obtenerTicketFiado } from "../ticket-memoria.js";
import {
  crearAlmacenCorrecciones,
  crearAlmacenDevoluciones,
  crearAlmacenDevolucionVistos,
  crearAlmacenIdempotenciaVentas,
  crearContadorDevoluciones,
  crearAlmacenStock,
  crearListaMovimientos,
  crearListaMovimientosCredito,
  crearListaMovimientosStock,
} from "./_almacen.js";
import type { Medio } from "../validation.js";
import { idempotency_key_for_return } from "../../modules/fiscal/fiscal.js";
import { decidir_nc } from "../../modules/fiscal/nc.js";
import { desagregar_iva_21 } from "../../modules/fiscal/iva.js";
import {
  registrar_devolucion,
  siguiente_numero_devolucion,
  type DevolucionResult,
  type DevolucionSeq,
  type EfectoDevolucion,
} from "../../modules/sales/devoluciones.js";
import { corregir_medio, type CorreccionOk } from "../../modules/sales/correccion_medio.js";
import { LEYENDA_NO_FISCAL } from "../../modules/sales/vender_mostrador.js";
import type { Sku } from "../../modules/inventario/inventario.js";
import { aplicarEnMemoria, aplicarMovimiento, type TxVentaAbierta } from "./stock.js";
import { registrarMovimientoDevolucion } from "./caja.js";
import { insertarMovimientosCaja } from "./movimientos-caja.js";
import { acumuladoNcParaVenta, asegurarDoc, buscarFacturaParaNd } from "./fiscal.js";

// PERS2-S25/S26 (ADR-0063): devoluciones y correcciones de medio. DB primero
// via dbVivaTenant(); solo en single sin base usa la memoria particionada. En
// multi sin base dbVivaTenant lanza BaseNoDisponible y se propaga (503).
// PERS5-S2 (ADR-0080): el correlativo D-* sale de ticket_counters (serie
// devolucion, FOR UPDATE) en la misma tx que inserta sale_returns;
// el contador queda como fuente solo en single sin base y como espejo.

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

export interface VentaParaDevolucion {
  sale_id: string;
  total_centavos: string;
  medio: Medio;
  idempotency_key: string;
  fueAcuenta: boolean;
}

/** Venta por sale_id: memoria caliente, luego sales del tenant. Sin DB (solo single) cae a memoria. */
export async function buscarVentaPorId(saleId: string): Promise<VentaParaDevolucion | null> {
  const idempotencia = crearAlmacenIdempotenciaVentas();
  const mem = [...idempotencia.comoMapaSoloLectura().entries()].find(([, t]) => t.sale_id === saleId) ?? null;
  if (mem) {
    return {
      sale_id: mem[1].sale_id,
      total_centavos: mem[1].total_centavos,
      medio: mem[1].medio,
      idempotency_key: mem[0],
      fueAcuenta: false,
    };
  }
  const fiado = obtenerTicketFiado(saleId);
  if (fiado) {
    return {
      sale_id: fiado.sale_id,
      total_centavos: fiado.total_centavos,
      medio: "Efectivo",
      idempotency_key: fiado.idempotency_key,
      fueAcuenta: true,
    };
  }
  const db = dbVivaTenant();
  if (!db) return null;
  try {
    const filas = await db
      .select()
      .from(sales)
      .where(dondeTenant(sales.tenantId, eq(sales.id, saleId)))
      .limit(1);
    const f = filas[0];
    if (!f) return null;
    return {
      sale_id: f.id,
      total_centavos: f.totalCentavos.toString(),
      medio: f.medio as Medio,
      idempotency_key: f.idempotencyKey,
      fueAcuenta: f.medio === "A cuenta",
    };
  } catch (e) {
    idempotencia.anteFalloPersistencia(e);
    return null;
  }
}

async function clienteDeVenta(key: string): Promise<string | undefined> {
  const mem = crearListaMovimientosCredito().listar().find((m) => m.key === key);
  if (mem) return mem.customer_id;
  const db = dbVivaTenant();
  if (!db) return undefined;
  try {
    const filas = await db
      .select({ customerId: customerMovements.customerId })
      .from(customerMovements)
      .where(dondeTenant(customerMovements.tenantId, eq(customerMovements.idempotencyKey, key)))
      .limit(1);
    return filas[0]?.customerId;
  } catch {
    return undefined;
  }
}

export interface VistoDevolucion {
  numero_devolucion: string;
  sale_id: string;
}

/** Visto idempotente de devolución: memoria, luego sale_returns con espejo. */
export async function leerVistoDevolucion(key: string): Promise<VistoDevolucion | null> {
  const vistos = crearAlmacenDevolucionVistos();
  const mem = vistos.obtener(key);
  if (mem) return { ...mem };
  const db = dbVivaTenant();
  if (!db) return null;
  try {
    const filas = await db.select().from(saleReturns).where(eq(saleReturns.idempotencyKey, key)).limit(1);
    const f = filas[0];
    if (!f) return null;
    const visto: VistoDevolucion = { numero_devolucion: f.numeroDevolucion, sale_id: f.saleId };
    vistos.guardar(key, visto);
    return { ...visto };
  } catch (e) {
    vistos.anteFalloPersistencia(e);
    return null;
  }
}

/** Acumulado devuelto por venta: union memoria + sale_returns dedup por número. */
// AUD-VTA-04: con enTx lee dentro de la tx de la devolución, después del lock
// de la venta; un error ahí aborta la tx y no cae a memoria.
export async function acumuladoDevoluciones(saleId: string, enTx?: TxVentaAbierta): Promise<bigint> {
  const devoluciones = crearAlmacenDevoluciones();
  const vistos = new Map<string, bigint>();
  for (const r of devoluciones.comoMapaSoloLectura().values()) {
    if (r.sale_id === saleId) vistos.set(r.numero_devolucion, BigInt(r.total_centavos));
  }
  const db = enTx ?? dbVivaTenant();
  if (!db) return [...vistos.values()].reduce((a, b) => a + b, 0n);
  try {
    const filas = await db.select().from(saleReturns).where(eq(saleReturns.saleId, saleId));
    for (const f of filas) {
      if (!vistos.has(f.numeroDevolucion)) vistos.set(f.numeroDevolucion, f.montoCentavos);
    }
    return [...vistos.values()].reduce((a, b) => a + b, 0n);
  } catch (e) {
    if (enTx) throw e;
    devoluciones.anteFalloPersistencia(e);
    return [...vistos.values()].reduce((a, b) => a + b, 0n);
  }
}

// AUD-VTA-03: unidades devolvibles por SKU = vendidas en las líneas del ticket
// menos las ya devueltas (movimientos COMPENSATORIO cuya key es una devolución
// de esta venta). null si la venta no tiene líneas conocidas (ventas previas a
// ticket_lines): ahí solo rige el tope en plata.
export async function devolviblesPorSku(saleId: string, enTx?: TxVentaAbierta): Promise<Map<string, number> | null> {
  const vistosRet = crearAlmacenDevolucionVistos();
  const vendidas = new Map<string, number>();
  const devueltas = new Map<string, { sku: string; cantidad: number }>();
  for (const m of crearListaMovimientosStock().listar()) {
    if (m.tipo !== "COMPENSATORIO" || vistosRet.obtener(m.idemKey)?.sale_id !== saleId) continue;
    devueltas.set(`${m.idemKey}:${m.sku}`, { sku: m.sku, cantidad: m.delta });
  }
  const db = enTx ?? dbVivaTenant();
  if (db) {
    try {
      const lineas = await db
        .select({ sku: products.sku, qty: ticketLines.qty })
        .from(ticketLines)
        .innerJoin(products, eq(products.id, ticketLines.productId))
        .where(dondeTenant(ticketLines.tenantId, eq(ticketLines.saleId, saleId)));
      for (const l of lineas) vendidas.set(l.sku, (vendidas.get(l.sku) ?? 0) + l.qty);
      const movs = await db
        .select({ idemKey: stockMovements.idemKey, sku: stockMovements.sku, delta: stockMovements.delta })
        .from(stockMovements)
        .innerJoin(saleReturns, eq(saleReturns.idempotencyKey, stockMovements.idemKey))
        .where(dondeTenant(stockMovements.tenantId, and(eq(saleReturns.saleId, saleId), eq(stockMovements.tipo, "COMPENSATORIO"))));
      for (const m of movs) devueltas.set(`${m.idemKey}:${m.sku}`, { sku: m.sku, cantidad: m.delta });
    } catch (e) {
      if (enTx) throw e;
      vistosRet.anteFalloPersistencia(e);
    }
  }
  // AUD-VTA-03: venta que solo vive en memoria (single sin base o caída).
  if (vendidas.size === 0) {
    for (const l of listarLineasTicket(saleId)) vendidas.set(l.product_id, (vendidas.get(l.product_id) ?? 0) + l.qty);
  }
  if (vendidas.size === 0) return null;
  for (const d of devueltas.values()) vendidas.set(d.sku, (vendidas.get(d.sku) ?? 0) - Math.abs(d.cantidad));
  return vendidas;
}

function ultimoNumeroDevolucion(): DevolucionSeq | null {
  const nr = crearContadorDevoluciones().leer();
  const n = nr > 1 ? nr - 1 : 0;
  return n > 0 ? { n } : null;
}

export interface RegistrarDevolucionInput {
  readonly key: string;
  readonly saleId: string;
  readonly montoCentavos: bigint;
  readonly items: ReadonlyArray<{ sku: string; cantidad: number }>;
  readonly medio: Medio;
  readonly motivo: string;
  readonly actor: string;
  readonly clientOccurredAt: string;
  readonly tenantId?: string | undefined;
}

export type RegistrarDevolucionResultado =
  | { ok: true; returnId: string; numero: string; saleId: string; montoCentavos: string; fiscalEstado: string; ncTipo: number | null }
  | { ok: false; status: 409; error: string; original: VistoDevolucion }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 422; error: string; acumulado_centavos?: string; facturado_centavos?: string; sku?: string; disponible?: number };

function espejoMemoriaDevolucion(
  key: string,
  returnId: string,
  numero: string,
  input: RegistrarDevolucionInput,
): void {
  const devoluciones = crearAlmacenDevoluciones();
  const vistosRet = crearAlmacenDevolucionVistos();
  const contador = crearContadorDevoluciones();
  devoluciones.guardar(returnId, {
    return_id: returnId,
    sale_id: input.saleId,
    numero_devolucion: numero,
    total_centavos: input.montoCentavos.toString(),
    medio: input.medio,
  });
  const visto: VistoDevolucion = { numero_devolucion: numero, sale_id: input.saleId };
  vistosRet.guardar(key, visto);
  const n = Number(/^D-(\d+)$/.exec(numero)?.[1] ?? 0);
  if (n >= contador.leer()) contador.fijar(n + 1);
}

type SalidaTxDevolucion =
  | { readonly estado: "repetida"; readonly original: VistoDevolucion }
  | { readonly estado: "fallo"; readonly fallo: Extract<DevolucionResult, { ok: false }> }
  | { readonly estado: "ok"; readonly numero: string; readonly efecto: EfectoDevolucion };

export async function registrarDevolucion(input: RegistrarDevolucionInput): Promise<RegistrarDevolucionResultado> {
  const vistosRet = crearAlmacenDevolucionVistos();
  const visto = await leerVistoDevolucion(input.key);
  if (visto) return { ok: false, status: 409, error: "idempotency-key repetida", original: visto };

  const venta = await buscarVentaPorId(input.saleId);
  if (!venta) return { ok: false, status: 404, error: "venta inexistente" };
  const ventaTotal = BigInt(venta.total_centavos);
  const acumuladoPrevio = await acumuladoDevoluciones(input.saleId);
  const devolvibles = await devolviblesPorSku(input.saleId);

  const factura = await buscarFacturaParaNd(input.saleId, input.tenantId);
  const acumuladoNc = await acumuladoNcParaVenta(input.saleId, input.tenantId);

  // Puerta de escritura: en multi sin base propaga BaseNoDisponible (503).
  const db = dbVivaTenant();
  const customerId = venta.fueAcuenta ? await clienteDeVenta(venta.idempotency_key) : undefined;

  // AUD-VTA-04: acumulado y devolvibles se pasan explícitos: la tx los relee
  // bajo lock y el camino memoria usa los leídos al entrar.
  const nucleo = (
    ultimo: DevolucionSeq | null,
    acumulado: bigint = acumuladoPrevio,
    devolviblesVigentes: Map<string, number> | null = devolvibles,
  ) =>
    registrar_devolucion({
      idempotencyKey: input.key,
      saleId: input.saleId,
      ventaTotalCentavos: ventaTotal,
      acumuladoPrevioCentavos: acumulado,
      montoCentavos: input.montoCentavos,
      items: input.items.map((it) => ({ sku: it.sku as Sku, cantidad: it.cantidad })),
      medio: input.medio,
      fueAcuenta: venta.fueAcuenta,
      customerId,
      motivo: input.motivo,
      actor: input.actor,
      ultimoDevolucion: ultimo,
      vistos: new Map(),
      devolviblesPorSku: devolviblesVigentes,
    });

  const mapearFallo = (dev: Extract<DevolucionResult, { ok: false }>): RegistrarDevolucionResultado => {
    if (dev.codigo === "TOPE_EXCEDIDO") {
      return {
        ok: false,
        status: 422,
        error: "devolución supera el total de la venta",
        acumulado_centavos: dev.acumuladoCentavos.toString(),
      };
    }
    if (dev.codigo === "CANTIDAD_EXCEDIDA") {
      return { ok: false, status: 422, error: "devolución supera lo vendido", sku: dev.sku, disponible: dev.disponible };
    }
    return { ok: false, status: 422, error: "devolución inválida" };
  };

  // Validación de dominio antes de la NC, como antes de PERS5: el número
  // definitivo se recalcula después (memoria o tx); acá solo decide 422.
  const previa = nucleo(ultimoNumeroDevolucion());
  if (!previa.ok) return mapearFallo(previa);

  const decision = decidir_nc(
    factura
      ? {
          cbteTipo: Number(factura.cbte_tipo),
          ptoVta: Number(factura.pto_vta),
          cbteNro: factura.cbte_nro,
          estado: factura.estado,
          impTotalCentavos: ventaTotal,
          docTipo: Number(factura.doc_tipo || "99"),
          docNro: factura.doc_nro || "0",
          condIvaReceptor: Number(factura.cond_iva_receptor || "5"),
        }
      : null,
    input.montoCentavos,
    acumuladoNc,
  );
  if (decision.decision === "tope-excedido") {
    return {
      ok: false,
      status: 422,
      error: "NC supera lo facturado",
      facturado_centavos: decision.facturadoCentavos.toString(),
    };
  }

  const returnId = crypto.randomUUID();
  let numero: string;
  let efecto: EfectoDevolucion;
  // AUD-VTA-04: true cuando stock y caja ya se escribieron en la tx de la
  // devolución; después del commit solo queda el espejo en memoria.
  let efectosEnTx = false;
  const cajaId = crypto.randomUUID();

  if (!db) {
    const ultimo = ultimoNumeroDevolucion();
    const dev = nucleo(ultimo);
    if (!dev.ok) return mapearFallo(dev);
    numero = siguiente_numero_devolucion(ultimo);
    efecto = dev.efecto;
    espejoMemoriaDevolucion(input.key, returnId, numero, input);
  } else {
    try {
      const salida = await db.transaction(async (tx): Promise<SalidaTxDevolucion> => {
        // AUD-VTA-04: lock de la venta antes del contador; dos devoluciones de
        // la misma venta se ordenan acá y la segunda relee el acumulado ya
        // comprometido por la primera.
        await tx
          .select({ id: sales.id })
          .from(sales)
          .where(dondeTenant(sales.tenantId, eq(sales.id, input.saleId)))
          .for("update");
        // PERS5-S2: el número sale de ticket_counters (serie devolucion,
        // FOR UPDATE) en la misma tx que inserta sale_returns, igual que
        // las ventas con mostrador. El lock serializa devoluciones
        // concurrentes: sin 409 falsos y sin recorrer sale_returns.
        let filas = await tx.select().from(ticketCounters).where(whereContadorTicket(SERIE_DEVOLUCION)).for("update");
        if (!filas[0]) {
          // P1-96 [tenant]: sin este filtro, un comercio nuevo hereda el máximo D-* de todos y arranca donde terminó otro.
          const previas = await tx.select({ numero: saleReturns.numeroDevolucion }).from(saleReturns).where(dondeTenant(saleReturns.tenantId));
          let maximo = 0;
          for (const f of previas) {
            const m = /^D-(\d+)$/.exec(f.numero);
            if (m) maximo = Math.max(maximo, Number(m[1]));
          }
          await tx.insert(ticketCounters).values(filaContadorTicket(SERIE_DEVOLUCION, maximo)).onConflictDoNothing();
          filas = await tx.select().from(ticketCounters).where(whereContadorTicket(SERIE_DEVOLUCION)).for("update");
        }
        const ultimo = filas[0]?.ultimo ?? 0;
        const seq = ultimo > 0 ? { n: ultimo } : null;
        const previo = await tx.select().from(saleReturns).where(eq(saleReturns.idempotencyKey, input.key)).limit(1);
        if (previo[0]) {
          const v: VistoDevolucion = { numero_devolucion: previo[0].numeroDevolucion, sale_id: previo[0].saleId };
          return { estado: "repetida", original: v };
        }
        const acumuladoTx = await acumuladoDevoluciones(input.saleId, tx);
        const devolviblesTx = await devolviblesPorSku(input.saleId, tx);
        const dev = nucleo(seq, acumuladoTx, devolviblesTx);
        if (!dev.ok) return { estado: "fallo", fallo: dev };
        const n = ultimo + 1;
        const num = siguiente_numero_devolucion(seq);
        await tx.insert(saleReturns).values(
          filaConTenant({
            id: returnId,
            idempotencyKey: input.key,
            saleId: input.saleId,
            numeroDevolucion: num,
            montoCentavos: input.montoCentavos,
            acumuladoPrevioCentavos: acumuladoTx,
            acumuladoNuevoCentavos: acumuladoTx + input.montoCentavos,
            medio: input.medio,
            fueAcuenta: venta.fueAcuenta,
            motivo: input.motivo,
            actor: input.actor,
          }),
        );
        await tx.update(ticketCounters).set({ ultimo: n }).where(whereContadorTicket(SERIE_DEVOLUCION));
        // AUD-VTA-04: stock inverso y caja opuesta en la misma tx que
        // sale_returns: o queda todo o no queda nada.
        for (const m of dev.efecto.movimientosStock) {
          const delta = Math.abs(m.delta);
          await tx.insert(stockMovements).values(
            filaConTenant({
              idemKey: input.key,
              sku: m.sku,
              loteId: null,
              delta,
              tipo: "COMPENSATORIO",
              ...(m.motivo ? { motivo: m.motivo } : {}),
            }),
          );
          await tx
            .update(products)
            .set({ stockActual: sql`${products.stockActual} + ${delta}` })
            .where(dondeTenant(products.tenantId, eq(products.sku, m.sku)) ?? eq(products.sku, m.sku));
        }
        if (dev.efecto.movimientoCaja) {
          await insertarMovimientosCaja(tx, [
            {
              id: cajaId,
              saleId: input.saleId,
              idempotencyKey: input.key,
              tipo: dev.efecto.movimientoCaja.tipo === "ingreso" ? "ingreso" : "egreso",
              metodo: input.medio,
              categoriaId: "devolucion_venta",
              origen: "devolucion",
              montoCentavos: input.montoCentavos,
            },
          ]);
        }
        return { estado: "ok", numero: num, efecto: dev.efecto };
      });
      if (salida.estado === "repetida") {
        vistosRet.guardar(input.key, salida.original);
        return { ok: false, status: 409, error: "idempotency-key repetida", original: salida.original };
      }
      if (salida.estado === "fallo") return mapearFallo(salida.fallo);
      numero = salida.numero;
      efecto = salida.efecto;
      efectosEnTx = true;
      espejoMemoriaDevolucion(input.key, returnId, numero, input);
    } catch (err) {
      if (esConflictoUnico(err)) {
        try {
          const previo = await db.select().from(saleReturns).where(eq(saleReturns.idempotencyKey, input.key)).limit(1);
          const f = previo[0];
          if (f) {
            const v: VistoDevolucion = { numero_devolucion: f.numeroDevolucion, sale_id: f.saleId };
            vistosRet.guardar(input.key, v);
            return { ok: false, status: 409, error: "idempotency-key repetida", original: v };
          }
        } catch (err2) {
          vistosRet.anteFalloPersistencia(err2);
        }
        vistosRet.anteFalloPersistencia(err);
      } else {
        vistosRet.anteFalloPersistencia(err);
      }
      // Single con base caída: camino memoria como hoy (la tx revirtió).
      const ultimo = ultimoNumeroDevolucion();
      const dev = nucleo(ultimo);
      if (!dev.ok) return mapearFallo(dev);
      numero = siguiente_numero_devolucion(ultimo);
      efecto = dev.efecto;
      espejoMemoriaDevolucion(input.key, returnId, numero, input);
    }
  }

  const e = efecto;

  if (efectosEnTx) {
    // AUD-VTA-04: la base ya tiene stock y caja; acá solo el espejo en memoria.
    const existencias = crearAlmacenStock();
    const movimientosStock = crearListaMovimientosStock();
    for (const m of e.movimientosStock) {
      const registro = { idemKey: input.key, sku: m.sku, loteId: null, delta: Math.abs(m.delta), tipo: "COMPENSATORIO" as const };
      aplicarEnMemoria(m.motivo ? { ...registro, motivo: m.motivo } : registro, existencias, movimientosStock);
    }
    if (e.movimientoCaja) {
      crearListaMovimientos().agregar({
        id: cajaId,
        tipo: e.movimientoCaja.tipo === "ingreso" ? "ingreso" : "egreso",
        metodo: input.medio,
        monto_centavos: input.montoCentavos.toString(),
        origen: "devolucion",
        sale_id: input.saleId,
        idempotency_key: input.key,
        ocurrido_en: new Date().toISOString(),
      });
    }
  }
  for (const m of efectosEnTx ? [] : e.movimientosStock) {
    await aplicarMovimiento({
      idemKey: input.key,
      sku: m.sku,
      loteId: null,
      delta: Math.abs(m.delta),
      tipo: "COMPENSATORIO",
      ...(m.motivo ? { motivo: m.motivo } : {}),
    });
  }
  if (e.movimientoCaja && !efectosEnTx) {
    await registrarMovimientoDevolucion({
      key: input.key,
      saleId: input.saleId,
      medio: input.medio,
      montoCentavos: input.montoCentavos,
      tipo: e.movimientoCaja.tipo === "ingreso" ? "ingreso" : "egreso",
    });
  }
  if (e.credito) {
    const credito = crearListaMovimientosCredito();
    const key = `${input.key}:devolucion`;
    if (db) {
      try {
        await db
          .insert(customerMovements)
          .values(
            filaConTenant({
              customerId: e.credito.customerId,
              tipo: "devolucion",
              debeCentavos: 0n,
              haberCentavos: e.credito.haberCentavos,
              saleId: input.saleId,
              idempotencyKey: key,
              motivo: e.credito.motivo,
              clientOccurredAt: new Date(input.clientOccurredAt),
            }),
          )
          .onConflictDoNothing();
      } catch (err) {
        credito.anteFalloPersistencia(err);
      }
    }
    credito.agregar({
      customer_id: e.credito.customerId,
      debe: "0",
      haber: e.credito.haberCentavos.toString(),
      key,
      fecha_ms: Date.now(),
    });
  }

  let fiscalEstado: string;
  let ncTipo: number | null = null;
  const fch = fechaHoy();
  if (decision.decision === "solo-interno") {
    fiscalEstado = "sin_factura";
  } else if (decision.decision === "esperar-cae") {
    ncTipo = 13;
    const fkey = `return:${returnId}:espera`;
    await asegurarDoc(
      {
        id: crypto.randomUUID(),
        idempotency_key: fkey,
        sale_id: input.saleId,
        tenant_id: input.tenantId ?? factura?.tenant_id ?? null,
        cbte_tipo: String(ncTipo),
        pto_vta: factura?.pto_vta ?? "3",
        cbte_nro: null,
        cbte_fch: fch,
        doc_tipo: factura?.doc_tipo ?? "99",
        doc_nro: factura?.doc_nro ?? "0",
        cond_iva_receptor: factura?.cond_iva_receptor ?? "5",
        estado: "espera_cae",
        cae: null,
        cae_vto: null,
        qr_payload: null,
        imp_iva_centavos: null,
        alic_iva_id: null,
        client_ocurred_at: input.clientOccurredAt,
        venta_leyenda: null,
        imp_total_centavos: input.montoCentavos.toString(),
        return_id: returnId,
        cbtes_asoc_tipo: null,
        cbtes_asoc_pto_vta: null,
        cbtes_asoc_nro: null,
      },
      input.tenantId,
    );
    fiscalEstado = "espera_cae";
  } else {
    ncTipo = decision.ncTipo;
    const fkey = idempotency_key_for_return(returnId, ncTipo);
    const esConIva = ncTipo === 8 || ncTipo === 3;
    let impIva: string | null = null;
    let alicId: string | null = null;
    if (esConIva) {
      const d = desagregar_iva_21(input.montoCentavos);
      if (d) {
        impIva = d.impIvaCentavos.toString();
        alicId = String(d.alicId);
      }
    }
    const facturaDoc = factura!;
    await asegurarDoc(
      {
        id: crypto.randomUUID(),
        idempotency_key: fkey,
        sale_id: input.saleId,
        tenant_id: input.tenantId ?? factura?.tenant_id ?? null,
        cbte_tipo: String(ncTipo),
        pto_vta: facturaDoc.pto_vta,
        cbte_nro: null,
        cbte_fch: fch,
        doc_tipo: facturaDoc.doc_tipo,
        doc_nro: facturaDoc.doc_nro,
        cond_iva_receptor: facturaDoc.cond_iva_receptor,
        estado: "pendiente",
        cae: null,
        cae_vto: null,
        qr_payload: null,
        imp_iva_centavos: impIva,
        alic_iva_id: alicId,
        client_ocurred_at: input.clientOccurredAt,
        venta_leyenda: null,
        imp_total_centavos: input.montoCentavos.toString(),
        return_id: returnId,
        cbtes_asoc_tipo: String(decision.cbtesAsoc.tipo),
        cbtes_asoc_pto_vta: String(decision.cbtesAsoc.ptoVta),
        cbtes_asoc_nro: decision.cbtesAsoc.nro,
      },
      input.tenantId,
    );
    fiscalEstado = "pendiente";
  }

  return {
    ok: true,
    returnId,
    numero,
    saleId: input.saleId,
    montoCentavos: input.montoCentavos.toString(),
    fiscalEstado,
    ncTipo,
  };
}

function fechaHoy(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function filaACorreccion(f: typeof ticketPaymentCorrections.$inferSelect): CorreccionOk {
  const correccion = {
    id: `corr-${f.idempotencyKey}`,
    saleId: f.saleId,
    medioOriginal: f.medioOriginal as Medio,
    medioNuevo: f.medioNuevo as Medio,
    motivo: f.motivo,
    actor: f.actor,
    leyenda: LEYENDA_NO_FISCAL,
  };
  return {
    status: 201 as const,
    correccion,
    auditoria: {
      accion: "correccion_medio" as const,
      correccionId: correccion.id,
      saleId: f.saleId,
      antes: f.medioOriginal as Medio,
      despues: f.medioNuevo as Medio,
      actor: f.actor,
      motivo: f.motivo,
    },
  };
}

/** Vistos de corrección: memoria caliente + ticket_payment_corrections, gana memoria. */
export async function vistosCorreccion(): Promise<Map<string, CorreccionOk>> {
  const correcciones = crearAlmacenCorrecciones();
  const union = new Map<string, CorreccionOk>(correcciones.comoMapaSoloLectura());
  const db = dbVivaTenant();
  if (!db) return union;
  try {
    const filas = await db.select().from(ticketPaymentCorrections);
    for (const f of filas) {
      if (!union.has(f.idempotencyKey)) union.set(f.idempotencyKey, filaACorreccion(f));
    }
    return union;
  } catch (e) {
    correcciones.anteFalloPersistencia(e);
    return union;
  }
}

export interface RegistrarCorreccionInput {
  readonly key: string;
  readonly saleId: string;
  readonly medioNuevo: Medio;
  readonly motivo: string;
  readonly actor: string;
}

export type RegistrarCorreccionResultado =
  | { ok: true; status: 201; correccion: CorreccionOk }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string; original?: CorreccionOk }
  | { ok: false; status: 422; error: string };

export async function registrarCorreccion(input: RegistrarCorreccionInput): Promise<RegistrarCorreccionResultado> {
  const correcciones = crearAlmacenCorrecciones();
  const venta = await buscarVentaPorId(input.saleId);
  if (!venta) return { ok: false, status: 404, error: "venta inexistente" };
  const r = corregir_medio({
    idempotencyKey: input.key,
    saleId: input.saleId,
    medioOriginal: venta.medio,
    medioNuevo: input.medioNuevo,
    motivo: input.motivo,
    actor: input.actor,
    vistos: await vistosCorreccion(),
  });
  if (r.status !== 201) {
    if (r.status === 409) return { ok: false, status: 409, error: r.error, ...(r.original ? { original: r.original } : {}) };
    return { ok: false, status: 422, error: r.error };
  }
  // Puerta de escritura: en multi sin base propaga BaseNoDisponible (503).
  const db = dbVivaTenant();
  if (!db) {
    correcciones.guardar(input.key, r);
    return { ok: true, status: 201, correccion: r };
  }
  try {
    const previo = await db
      .select()
      .from(ticketPaymentCorrections)
      .where(eq(ticketPaymentCorrections.idempotencyKey, input.key))
      .limit(1);
    if (previo[0]) {
      const original = filaACorreccion(previo[0]);
      correcciones.guardar(input.key, original);
      return { ok: false, status: 409, error: "idempotency-key repetida", original };
    }
    const filas = await db
      .insert(ticketPaymentCorrections)
      .values({
        idempotencyKey: input.key,
        saleId: input.saleId,
        medioOriginal: venta.medio,
        medioNuevo: input.medioNuevo,
        motivo: input.motivo,
        actor: input.actor,
      })
      .onConflictDoNothing({ target: ticketPaymentCorrections.idempotencyKey })
      .returning({ id: ticketPaymentCorrections.id });
    if (!filas[0]) {
      const carrera = await db
        .select()
        .from(ticketPaymentCorrections)
        .where(eq(ticketPaymentCorrections.idempotencyKey, input.key))
        .limit(1);
      const original = carrera[0] ? filaACorreccion(carrera[0]) : r;
      correcciones.guardar(input.key, original);
      return { ok: false, status: 409, error: "idempotency-key repetida", original };
    }
    correcciones.guardar(input.key, r);
    return { ok: true, status: 201, correccion: r };
  } catch (e) {
    if (esConflictoUnico(e)) {
      try {
        const previo = await db
          .select()
          .from(ticketPaymentCorrections)
          .where(eq(ticketPaymentCorrections.idempotencyKey, input.key))
          .limit(1);
        if (previo[0]) {
          const original = filaACorreccion(previo[0]);
          correcciones.guardar(input.key, original);
          return { ok: false, status: 409, error: "idempotency-key repetida", original };
        }
      } catch (e2) {
        correcciones.anteFalloPersistencia(e2);
      }
      correcciones.anteFalloPersistencia(e);
    } else {
      correcciones.anteFalloPersistencia(e);
    }
    correcciones.guardar(input.key, r);
    return { ok: true, status: 201, correccion: r };
  }
}
