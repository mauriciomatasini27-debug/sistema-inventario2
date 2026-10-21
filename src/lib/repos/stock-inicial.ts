import { and, asc, count, desc, eq, notExists, sql, TransactionRollbackError } from "drizzle-orm";
import { products, stockMovements } from "../../db/schema.js";
import { dbVivaTenant, intentarLeer, type TenantDb } from "../server-db.js";
import { listarAltasAlVender } from "../ticket-memoria.js";
import {
  crearAlmacenProductos,
  crearAlmacenStock,
  crearListaMovimientosStock,
  type StoredStockMovement,
} from "./_almacen.js";
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
  const pendiente = and(
    eq(products.origen, "alta_al_vender"),
    notExists(
      db
        .select({ uno: sql`1` })
        .from(stockMovements)
        .where(and(eq(stockMovements.sku, products.sku), eq(stockMovements.tipo, "ALTA"))),
    ),
  );
  const filas = await db
    .select({ sku: products.sku, nombre: products.nombre, vendidas30d: vendidas })
    .from(products)
    .leftJoin(ventas30d, eq(ventas30d.productId, products.id))
    .where(pendiente)
    .orderBy(desc(vendidas), asc(products.nombre))
    .limit(limite);
  const totales = await db.select({ total: count() }).from(products).where(pendiente);
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
  await aplicarMovimiento({
    idemKey: `stock-inicial:${sku}`,
    sku,
    loteId: null,
    delta: cantidad,
    tipo: "ALTA",
    motivo: "stock inicial",
  });
  return { ok: true };
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
    const provisorio = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.sku, sku), eq(products.origen, "alta_al_vender")))
      .limit(1);
    if (!provisorio[0]) return { ok: false, codigo: "NO_PENDIENTE" };
    const alta = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(and(eq(stockMovements.sku, sku), eq(stockMovements.tipo, "ALTA")))
      .limit(1);
    if (alta[0]) return { ok: false, codigo: "NO_PENDIENTE" };
  } catch (e) {
    crearListaMovimientosStock().anteFalloPersistencia(e);
    return cargarStockInicialMemoria(sku, cantidad);
  }
  const registro: StoredStockMovement = {
    idemKey: `stock-inicial:${sku}`,
    sku,
    loteId: null,
    delta: cantidad,
    tipo: "ALTA",
    motivo: "stock inicial",
  };
  try {
    await db.transaction(async (tx) => {
      const fila = await tx
        .insert(stockMovements)
        .values(registro)
        .onConflictDoNothing()
        .returning({ id: stockMovements.id });
      // Sin fila, otro "Guardar" ganó el índice parcial: nada que sumar.
      if (!fila[0]) tx.rollback();
      await tx
        .update(products)
        .set({ stockActual: sql`${products.stockActual} + ${cantidad}` })
        .where(eq(products.sku, sku));
    });
  } catch (e) {
    if (e instanceof TransactionRollbackError) return { ok: false, codigo: "NO_PENDIENTE" };
    crearListaMovimientosStock().anteFalloPersistencia(e);
    throw e;
  }
  aplicarEnMemoria(registro, crearAlmacenStock(), crearListaMovimientosStock());
  return { ok: true };
}
