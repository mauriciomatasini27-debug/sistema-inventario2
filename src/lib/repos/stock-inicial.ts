import { and, asc, count, desc, eq, notExists, sql } from "drizzle-orm";
import { products, stockMovements } from "../../db/schema.js";
import { dbVivaTenant, intentarLeer, type TenantDb } from "../server-db.js";
import { dondeTenant } from "../tenant-scope.js";
import { listarAltasAlVender } from "../ticket-memoria.js";
import {
  crearAlmacenLotes,
  crearAlmacenProductos,
  crearAlmacenStock,
  crearListaMovimientosStock,
  type StoredStockMovement,
} from "./_almacen.js";
import { asegurarLoteGenerico } from "./lote-generico.js";
import { subconsultaVentas30d, ventasPorProductoMemoria } from "./_ventas-30d.js";
import { aplicarEnMemoria, aplicarMovimiento } from "./stock.js";

// STOCK-S4 (ADR-0106): carga progresiva del stock inicial de los productos
// creados al vender. Pendiente = origen "alta_al_vender" sin movimiento ALTA.

const VENTANA_30_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

export interface PendienteStockInicial {
  readonly sku: string;
  readonly nombre: string;
  readonly vendidas30d: number;
}

export interface PendientesStockInicial {
  readonly items: PendienteStockInicial[];
  readonly total: number;
}

export interface ListarPendientesStockInicialInput {
  readonly limite?: number;
  readonly ahora?: Date;
}

export type CargarStockInicialResultado =
  | { ok: true }
  | { ok: false; codigo: "NO_PENDIENTE" | "CANTIDAD_INVALIDA" };

function listarPendientesMemoria(limite: number): PendientesStockInicial {
  const movimientos = crearListaMovimientosStock().listar();
  const conAlta = new Set(movimientos.filter((m) => m.tipo === "ALTA").map((m) => m.sku));
  const productos = crearAlmacenProductos();
  const vendidas = ventasPorProductoMemoria();
  const pendientes = listarAltasAlVender()
    .filter((sku) => !conAlta.has(sku))
    .map((sku) => ({
      sku,
      nombre: productos.obtener(sku)?.nombre ?? sku,
      vendidas30d: vendidas.get(sku) ?? 0,
    }))
    .sort((a, b) => b.vendidas30d - a.vendidas30d || a.nombre.localeCompare(b.nombre));
  return { items: pendientes.slice(0, limite), total: pendientes.length };
}

async function listarPendientesDb(
  db: TenantDb,
  limite: number,
  desde: Date,
): Promise<PendientesStockInicial> {
  const ventas30d = subconsultaVentas30d(db, desde);
  const vendidas = sql<number>`coalesce(${ventas30d.vendidas}, 0)`.mapWith(Number);
  const movAlta = dondeTenant(
    stockMovements.tenantId,
    and(eq(stockMovements.sku, products.sku), eq(stockMovements.tipo, "ALTA")),
  ) ?? and(eq(stockMovements.sku, products.sku), eq(stockMovements.tipo, "ALTA"));
  const pendiente = and(
    eq(products.origen, "alta_al_vender"),
    notExists(db.select({ uno: sql`1` }).from(stockMovements).where(movAlta)),
  );
  const wPend = dondeTenant(products.tenantId, pendiente) ?? pendiente;
  const filas = await db
    .select({ sku: products.sku, nombre: products.nombre, vendidas30d: vendidas })
    .from(products)
    .leftJoin(ventas30d, eq(ventas30d.productId, products.id))
    .where(wPend)
    .orderBy(desc(vendidas), asc(products.nombre))
    .limit(limite);
  const totales = await db.select({ total: count() }).from(products).where(wPend);
  return {
    items: filas.map((f) => ({ sku: f.sku, nombre: f.nombre, vendidas30d: f.vendidas30d })),
    total: Number(totales[0]?.total ?? 0),
  };
}

export async function listarPendientesStockInicial(
  input: ListarPendientesStockInicialInput = {},
): Promise<PendientesStockInicial> {
  const limite = Math.max(0, Math.floor(input.limite ?? 5));
  const ahora = input.ahora ?? new Date();
  const desde = new Date(ahora.getTime() - VENTANA_30_DIAS_MS);
  const deDb = await intentarLeer((db) => listarPendientesDb(db, limite, desde));
  return deDb ?? listarPendientesMemoria(limite);
}

async function cargarStockInicialMemoria(
  sku: string,
  cantidad: number,
): Promise<CargarStockInicialResultado> {
  if (!listarAltasAlVender().includes(sku)) return { ok: false, codigo: "NO_PENDIENTE" };
  if (crearListaMovimientosStock().listar().some((m) => m.sku === sku && m.tipo === "ALTA")) {
    return { ok: false, codigo: "NO_PENDIENTE" };
  }
  const loteId = await asegurarLoteGenerico(sku);
  await aplicarMovimiento({
    idemKey: `stock-inicial:${sku}`,
    sku,
    loteId,
    delta: cantidad,
    tipo: "ALTA",
    motivo: "stock inicial",
    condicionResto: 0,
  });
  return { ok: true };
}

function esChoqueStockInicial(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur; i++) {
    if (typeof cur === "object" && cur !== null && "code" in cur && (cur as { code: unknown }).code === "23505") return true;
    cur = typeof cur === "object" && cur !== null && "cause" in cur ? (cur as { cause?: unknown }).cause : undefined;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("stock_movements_stock_inicial_unico");
}

export async function cargarStockInicial(
  sku: string,
  cantidad: number,
): Promise<CargarStockInicialResultado> {
  if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 99999) {
    return { ok: false, codigo: "CANTIDAD_INVALIDA" };
  }
  const db = dbVivaTenant();
  if (!db) return cargarStockInicialMemoria(sku, cantidad);
  try {
    const wProv =
      dondeTenant(products.tenantId, and(eq(products.sku, sku), eq(products.origen, "alta_al_vender"))) ??
      and(eq(products.sku, sku), eq(products.origen, "alta_al_vender"));
    const provisorio = await db.select({ id: products.id }).from(products).where(wProv).limit(1);
    if (!provisorio[0]) return { ok: false, codigo: "NO_PENDIENTE" };
    const wAlta =
      dondeTenant(stockMovements.tenantId, and(eq(stockMovements.sku, sku), eq(stockMovements.tipo, "ALTA"))) ??
      and(eq(stockMovements.sku, sku), eq(stockMovements.tipo, "ALTA"));
    const alta = await db.select({ id: stockMovements.id }).from(stockMovements).where(wAlta).limit(1);
    if (alta[0]) return { ok: false, codigo: "NO_PENDIENTE" };
  } catch (e) {
    crearListaMovimientosStock().anteFalloPersistencia(e);
    return cargarStockInicialMemoria(sku, cantidad);
  }
  const loteId = await asegurarLoteGenerico(sku);
  const registro: StoredStockMovement = {
    idemKey: `stock-inicial:${sku}`,
    sku,
    loteId,
    delta: cantidad,
    tipo: "ALTA",
    motivo: "stock inicial",
  };
  try {
    await db.transaction(async (tx) => {
      await aplicarMovimiento({ ...registro, condicionResto: 0, tx });
    });
  } catch (e) {
    if (esChoqueStockInicial(e)) return { ok: false, codigo: "NO_PENDIENTE" };
    crearListaMovimientosStock().anteFalloPersistencia(e);
    throw e;
  }
  aplicarEnMemoria(registro, crearAlmacenStock(), crearListaMovimientosStock(), crearAlmacenLotes(), {
    condicionResto: 0,
    exigirResto: false,
  });
  return { ok: true };
}
