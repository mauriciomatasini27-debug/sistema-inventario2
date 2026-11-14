import { and, asc, eq, gte, lt } from "drizzle-orm";
import { products, sales, stockLots, stockMovements, ticketLines } from "../../db/schema.js";
import { saleReturns, ticketDiscounts } from "../../db/schema-tickets.js";
import type { LecturasIA } from "../../modules/ia/asistente.js";
import { mesAR } from "../fecha-ar.js";
import { dbVivaTenant } from "../server-db.js";
import { conTenant } from "../tenant-mode.js";
import { dondeTenant } from "../tenant-scope.js";
import { listarTodosLosDescuentosTicket, listarTodasLasLineasTicket } from "../ticket-memoria.js";
import { construirResumen } from "../panel-resumen.js";
import {
  calcularRotacionLenta,
  calcularTopProductos,
  margenDeProducto,
  productosMenorMargen,
  buscarProductoPorTexto,
  type DevolucionTop,
  type LineaVentaTop,
  type MovimientoRotacion,
  type ProductoCatalogoCosto,
  type ProductoStock,
} from "../../modules/ia/lecturas.js";
import {
  crearAlmacenDevolucionVistos,
  crearAlmacenLotes,
  crearAlmacenProductos,
  crearAlmacenStock,
  crearListaMovimientosStock,
} from "./_almacen.js";
import { obtenerBalance } from "./caja.js";
import { listarProductos } from "./catalogo.js";
import { listarClientesConSaldo } from "./fiado.js";
import { clasificarLotes, listarLotes } from "./lotes.js";
import { leerResumenPanel } from "./panel.js";
import { listarCatalogoVivo } from "./whatsapp.js";

// IA-S4 / IA-S2 (PRD-IA-01, ADR-0044): lecturas reales del asistente. Cada
// herramienta conectada lee datos del tenant del comercio, nunca números
// inventados, y devuelve la fuente usada.
type Fuente = "db" | "memoria";

function limiteDe(params: unknown, porDefecto: number, max: number): number {
  if (typeof params !== "object" || params === null) return porDefecto;
  const valor = (params as { limite?: unknown }).limite;
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 1 ? Math.min(valor, max) : porDefecto;
}

function diasDe(params: unknown, porDefecto: number, max: number, min = 1): number {
  if (typeof params !== "object" || params === null) return porDefecto;
  const valor = (params as { dias?: unknown }).dias;
  return typeof valor === "number" && Number.isInteger(valor) && valor >= min ? Math.min(valor, max) : porDefecto;
}

function productoDe(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null) return undefined;
  const valor = (params as { producto?: unknown }).producto;
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

function rangoMes(ahora: Date): { desde: Date; hasta: Date } {
  const mes = mesAR(ahora);
  const anio = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const siguiente = numero === 12 ? `${anio + 1}-01-01` : `${anio}-${String(numero + 1).padStart(2, "0")}-01`;
  return { desde: new Date(`${mes}-01T03:00:00.000Z`), hasta: new Date(`${siguiente}T03:00:00.000Z`) };
}

function costosMemoria(): Map<string, bigint> {
  const costos = new Map<string, bigint>();
  for (const lote of crearAlmacenLotes().comoMapaSoloLectura().values()) {
    costos.set(lote.sku, BigInt(lote.costoCentavos));
  }
  return costos;
}

async function leerCostosVigentes(): Promise<{ costos: Map<string, bigint>; fuente: Fuente }> {
  const db = dbVivaTenant();
  if (!db) return { costos: costosMemoria(), fuente: "memoria" };
  try {
    const filas = await db
      .select({ sku: stockLots.sku, costo: stockLots.costoCentavos })
      .from(stockLots)
      .orderBy(asc(stockLots.createdAt));
    const costos = new Map<string, bigint>();
    for (const fila of filas) costos.set(fila.sku, fila.costo);
    return { costos, fuente: "db" };
  } catch (e) {
    crearAlmacenLotes().anteFalloPersistencia(e);
    return { costos: costosMemoria(), fuente: "memoria" };
  }
}

function catalogoStockMemoria(): ProductoStock[] {
  const stock = crearAlmacenStock().comoMapaSoloLectura();
  const fichas = crearAlmacenProductos().comoMapaSoloLectura();
  return [...stock.entries()].map(([sku, cantidad]) => ({
    sku,
    nombre: fichas.get(sku)?.nombre ?? sku,
    stock: cantidad,
  }));
}

async function leerCatalogoStock(): Promise<{ productos: ProductoStock[]; fuente: Fuente }> {
  const db = dbVivaTenant();
  if (!db) return { productos: catalogoStockMemoria(), fuente: "memoria" };
  try {
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, stock: products.stockActual })
      .from(products);
    return { productos: filas, fuente: "db" };
  } catch (e) {
    crearAlmacenProductos().anteFalloPersistencia(e);
    return { productos: catalogoStockMemoria(), fuente: "memoria" };
  }
}

function aMovimientoRotacion(
  fila: { sku: string; delta: number; creadoEn: Date | null },
): MovimientoRotacion {
  return {
    sku: fila.sku,
    tipo: fila.delta > 0 ? "devolucion" : "venta",
    cantidad: Math.abs(fila.delta),
    ocurridoEn: fila.creadoEn?.toISOString() ?? null,
  };
}

function movimientosMemoria(): MovimientoRotacion[] {
  const devoluciones = new Set(crearAlmacenDevolucionVistos().comoMapaSoloLectura().keys());
  return crearListaMovimientosStock()
    .listar()
    .filter((m) => m.tipo === "VENTA" || (m.tipo === "COMPENSATORIO" && devoluciones.has(m.idemKey)))
    .filter((m) => m.delta !== 0)
    .map((m) => aMovimientoRotacion({ sku: m.sku, delta: m.delta, creadoEn: null }));
}

async function leerMovimientosRotacion(desde: Date): Promise<{ movimientos: MovimientoRotacion[]; fuente: Fuente }> {
  const db = dbVivaTenant();
  if (!db) return { movimientos: movimientosMemoria(), fuente: "memoria" };
  try {
    const ventas = await db
      .select({
        sku: stockMovements.sku,
        delta: stockMovements.delta,
        creadoEn: stockMovements.createdAt,
      })
      .from(stockMovements)
      .where(and(eq(stockMovements.tipo, "VENTA"), gte(stockMovements.createdAt, desde)));
    const devoluciones = await db
      .select({
        sku: stockMovements.sku,
        delta: stockMovements.delta,
        creadoEn: stockMovements.createdAt,
      })
      .from(stockMovements)
      .innerJoin(saleReturns, eq(saleReturns.idempotencyKey, stockMovements.idemKey))
      .where(and(eq(stockMovements.tipo, "COMPENSATORIO"), gte(stockMovements.createdAt, desde)));
    return { movimientos: [...ventas, ...devoluciones].map(aMovimientoRotacion), fuente: "db" };
  } catch (e) {
    crearListaMovimientosStock().anteFalloPersistencia(e);
    return { movimientos: movimientosMemoria(), fuente: "memoria" };
  }
}

function ventasTopMemoria(): { ventas: LineaVentaTop[]; devoluciones: DevolucionTop[] } {
  const fichas = crearAlmacenProductos().comoMapaSoloLectura();
  const lineas = listarTodasLasLineasTicket();
  const descuentos = listarTodosLosDescuentosTicket();
  const lineasPorVenta = new Map<string, typeof lineas>();
  for (const linea of lineas) {
    const lista = lineasPorVenta.get(linea.sale_id) ?? [];
    lista.push(linea);
    lineasPorVenta.set(linea.sale_id, lista);
  }
  const descuentosPorVenta = new Map<string, typeof descuentos>();
  for (const descuento of descuentos) {
    const lista = descuentosPorVenta.get(descuento.sale_id) ?? [];
    lista.push(descuento);
    descuentosPorVenta.set(descuento.sale_id, lista);
  }

  const ventas: LineaVentaTop[] = [];
  for (const [saleId, filas] of lineasPorVenta) {
    const deLaVenta = (descuentosPorVenta.get(saleId) ?? []).sort((a, b) => a.linea_idx - b.linea_idx);
    const porSku = new Map(deLaVenta.map((d) => [d.sku, d] as const));
    filas.forEach((linea, indice) => {
      const descuento = porSku.get(linea.product_id) ?? deLaVenta[indice];
      const sku = descuento?.sku ?? linea.product_id;
      ventas.push({
        sku,
        nombre: fichas.get(sku)?.nombre ?? sku,
        cantidad: linea.qty,
        totalCentavos: descuento ? BigInt(descuento.neto_centavos) : BigInt(linea.precio_centavos) * BigInt(linea.qty),
      });
    });
  }
  const devoluciones = movimientosMemoria()
    .filter((m) => m.tipo === "devolucion")
    .map((m) => ({ sku: m.sku, cantidad: m.cantidad }));
  return { ventas, devoluciones };
}

async function ventasTopDb(desde: Date, hasta: Date): Promise<{ ventas: LineaVentaTop[]; devoluciones: DevolucionTop[] }> {
  const db = dbVivaTenant();
  if (!db) return ventasTopMemoria();
  const lineas = await db
    .select({
      saleId: ticketLines.saleId,
      productId: ticketLines.productId,
      sku: products.sku,
      nombre: products.nombre,
      qty: ticketLines.qty,
      precio: ticketLines.precioCentavos,
    })
    .from(ticketLines)
    .innerJoin(sales, eq(sales.id, ticketLines.saleId))
    .leftJoin(products, eq(products.id, ticketLines.productId))
    .where(dondeTenant(sales.tenantId, and(gte(sales.clientOccurredAt, desde), lt(sales.clientOccurredAt, hasta))));
  const descuentos = await db
    .select({ saleId: ticketDiscounts.saleId, sku: ticketDiscounts.sku, neto: ticketDiscounts.netoCentavos })
    .from(ticketDiscounts)
    .innerJoin(sales, eq(sales.id, ticketDiscounts.saleId))
    .where(dondeTenant(sales.tenantId, and(gte(sales.clientOccurredAt, desde), lt(sales.clientOccurredAt, hasta))));
  const devolucionesFilas = await db
    .select({ sku: stockMovements.sku, delta: stockMovements.delta })
    .from(stockMovements)
    .innerJoin(saleReturns, eq(saleReturns.idempotencyKey, stockMovements.idemKey))
    .where(
      and(
        eq(stockMovements.tipo, "COMPENSATORIO"),
        gte(stockMovements.createdAt, desde),
        lt(stockMovements.createdAt, hasta),
      ),
    );

  const ventasConDescuento = new Set(descuentos.map((d) => d.saleId));
  const porSku = new Map<string, { sku: string; nombre: string; cantidad: number; totalCentavos: bigint }>();
  for (const linea of lineas) {
    const sku = linea.sku ?? linea.productId;
    const acumulado = porSku.get(sku) ?? {
      sku,
      nombre: linea.nombre ?? sku,
      cantidad: 0,
      totalCentavos: 0n,
    };
    acumulado.cantidad += linea.qty;
    if (!ventasConDescuento.has(linea.saleId)) {
      acumulado.totalCentavos += linea.precio * BigInt(linea.qty);
    }
    porSku.set(sku, acumulado);
  }
  for (const descuento of descuentos) {
    const acumulado = porSku.get(descuento.sku);
    if (acumulado) acumulado.totalCentavos += descuento.neto;
  }
  return {
    ventas: [...porSku.values()],
    devoluciones: devolucionesFilas
      .filter((f) => f.delta > 0)
      .map((f) => ({ sku: f.sku, cantidad: f.delta })),
  };
}

async function leerVentasTop(
  desde: Date,
  hasta: Date,
): Promise<{ ventas: LineaVentaTop[]; devoluciones: DevolucionTop[]; fuente: Fuente }> {
  const db = dbVivaTenant();
  if (!db) return { ...ventasTopMemoria(), fuente: "memoria" };
  try {
    return { ...(await ventasTopDb(desde, hasta)), fuente: "db" };
  } catch (e) {
    crearListaMovimientosStock().anteFalloPersistencia(e);
    return { ...ventasTopMemoria(), fuente: "memoria" };
  }
}

export function crearLecturasIA(opts: { ahora?: () => Date } = {}): LecturasIA {
  const ahora = opts.ahora ?? (() => new Date());
  return {
    stock_bajo: (ctx, params) =>
      conTenant(ctx.tenantId, async () => {
        const limite = limiteDe(params, 10, 50);
        const catalogo = await listarCatalogoVivo(ctx.tenantId);
        return catalogo
          .filter((p) => p.umbral > 0 && p.stock <= p.umbral)
          .sort((a, b) => a.stock - b.stock)
          .slice(0, limite)
          .map((p) => ({ sku: p.sku, nombre: p.nombre, stock: p.stock, minimo: p.umbral }));
      }),
    deudores: (ctx, params) =>
      conTenant(ctx.tenantId, async () => {
        const limite = limiteDe(params, 10, 20);
        const { clientes } = await listarClientesConSaldo(ahora().getTime());
        return clientes
          .filter((c) => c.saldoCentavos > 0n)
          .sort((a, b) => (a.saldoCentavos === b.saldoCentavos ? 0 : a.saldoCentavos > b.saldoCentavos ? -1 : 1))
          .slice(0, limite)
          .map((c) => ({ nombre: c.nombre, saldoCentavos: c.saldoCentavos.toString(), diasAtraso: c.diasMax }));
      }),
    por_vencer: (ctx, params) =>
      conTenant(ctx.tenantId, async () => {
        const dias = diasDe(params, 15, 90);
        const clasificacion = clasificarLotes(await listarLotes(), ahora().getTime());
        return [
          ...clasificacion.vencidos,
          ...clasificacion.alertas_3d,
          ...clasificacion.alertas_7d,
          ...clasificacion.alertas_15d,
        ]
          .filter((a) => a.dias <= dias)
          .sort((a, b) => a.dias - b.dias)
          .map((a) => ({ sku: a.sku, dias: a.dias, cantidadRestante: a.cantidad_restante, venceEl: a.vence_el }));
      }),
    caja_dia: (ctx) =>
      conTenant(ctx.tenantId, async () => {
        const balance = await obtenerBalance();
        return { totalCentavos: balance.total, porMedio: balance.porMedio, fuente: balance.fuente };
      }),
    ventas_periodo: (ctx) =>
      conTenant(ctx.tenantId, async () => {
        const { datos, fuente } = await leerResumenPanel(ahora());
        const resumen = construirResumen(ahora(), datos);
        return {
          ventasMesCentavos: resumen.ventas_mes_centavos,
          ticketsHoy: resumen.tickets_hoy,
          fuente,
        };
      }),
    top_productos: (ctx, params) =>
      conTenant(ctx.tenantId, async () => {
        const limite = limiteDe(params, 5, 20);
        const { desde, hasta } = rangoMes(ahora());
        const { ventas, devoluciones, fuente } = await leerVentasTop(desde, hasta);
        return { productos: calcularTopProductos(ventas, devoluciones, limite), fuente };
      }),
    margen_producto: (ctx, params) =>
      conTenant(ctx.tenantId, async () => {
        const texto = productoDe(params);
        const catalogo = await listarProductos("");
        const costos = await leerCostosVigentes();
        const items: ProductoCatalogoCosto[] = catalogo.fichas.map((ficha) => ({
          sku: ficha.sku,
          nombre: ficha.nombre,
          precioCentavos: BigInt(ficha.precioCentavos),
          costoCentavos: costos.costos.get(ficha.sku) ?? null,
        }));
        const fuente: Fuente = catalogo.fuente === "db" && costos.fuente === "db" ? "db" : "memoria";
        if (texto !== undefined) {
          const encontrado = buscarProductoPorTexto(items, texto);
          return { producto: encontrado ? margenDeProducto(encontrado) : null, fuente };
        }
        return { productos: productosMenorMargen(items), fuente };
      }),
    rotacion_lenta: (ctx, params) =>
      conTenant(ctx.tenantId, async () => {
        const dias = diasDe(params, 30, 365, 7);
        const desde = new Date(ahora().getTime() - dias * 86_400_000);
        const catalogo = await leerCatalogoStock();
        const movimientos = await leerMovimientosRotacion(desde);
        const fuente: Fuente = catalogo.fuente === "db" && movimientos.fuente === "db" ? "db" : "memoria";
        return {
          productos: calcularRotacionLenta(catalogo.productos, movimientos.movimientos, 10),
          fuente,
        };
      }),
  };
}
