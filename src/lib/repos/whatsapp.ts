import { eq } from "drizzle-orm";
import { products, stockMovements } from "../../db/schema.js";
import { purchaseOrders } from "../../db/schema-proveedores.js";
import { suppliers } from "../../db/schema-proveedores.js";
import { whatsappSessions } from "../../db/schema-whatsapp.js";
import { conTenant, tenantActual } from "../tenant-mode.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import {
  control,
  crearAlmacenPrecios,
  crearAlmacenProductos,
  crearAlmacenPurchaseOrders,
  crearAlmacenStock,
  crearAlmacenSuppliers,
  crearAlmacenWaFriday,
  crearAlmacenWaSessions,
  crearConjuntoWaEnviados,
  crearListaMovimientosStock,
} from "./_almacen.js";
import { catalogo_vivo } from "../../modules/whatsapp/catalogo.js";
import { crear_item_viernes, type ListaViernes } from "../../modules/whatsapp/lista-viernes.js";
import type { MovimientoVista, PedidoDia } from "../../modules/whatsapp/dia-a-dia.js";
import type { ItemVivo } from "../../modules/whatsapp/servicio.js";
import type { Preferencias } from "../../modules/whatsapp/optin.js";
import type { ItemStock } from "../../modules/email/stock-matutino.js";
import { calcular_semanal, type CalculoSemanal, type FaltanteSemana, type VentaSemana } from "../../modules/email/resumen-semanal.js";

// Sin contexto en multi (webhook, email/send) la memoria particionada no es
// alcanzable: solo se toca con tenant explícito o dentro de conTenant. Las
// factorías resuelven la partición al crearse, por eso se crean dentro del
// contexto del tenant y nunca a nivel de módulo.
function conParticion<T>(tenantId: string | undefined, fn: () => T): T {
  if (tenantId) return conTenant(tenantId, fn);
  return fn();
}

// Sin leer el modo en este archivo: con tenant (explícito o ambiente) la
// memoria es alcanzable; sin tenant solo single la tiene (en multi el acceso
// lanza "Falta tenant" y se responde que no hay memoria).
function hayMemoria(tenantId?: string): boolean {
  if (tenantId ?? tenantActual()) return true;
  try {
    crearAlmacenWaSessions().comoMapaSoloLectura();
    return true;
  } catch {
    return false;
  }
}

export interface FilaConsulta {
  sku: string;
  nombre: string;
  stock: number;
  precio: bigint;
}

// Catálogo para GET /api/whatsapp/consult: products del tenant con DB viva,
// memoria particionada en single sin base. En multi sin base propaga.
export async function listarProductosConsulta(tenantId?: string): Promise<{ filas: FilaConsulta[]; fuente: "db" | "memoria" }> {
  const db = dbVivaTenant(tenantId);
  if (!db) return { filas: conParticion(tenantId, filasConsultaMemoria), fuente: "memoria" };
  try {
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, stock: products.stockActual, precio: products.precioCentavos })
      .from(products);
    return { filas, fuente: "db" };
  } catch (e) {
    conParticion(tenantId, () => crearAlmacenStock()).anteFalloPersistencia(e);
    return { filas: conParticion(tenantId, filasConsultaMemoria), fuente: "memoria" };
  }
}

function filasConsultaMemoria(): FilaConsulta[] {
  const stock = crearAlmacenStock().mapaVivo();
  const precios = crearAlmacenPrecios().mapaVivo();
  return [...stock.entries()].map(([sku, cantidad]) => ({ sku, nombre: sku, stock: cantidad, precio: BigInt(precios.get(sku) ?? 0) }));
}

// Catálogo vivo para el webhook (misma forma que Drizzle en prod).
// ALR-S1: el umbral sale de products.min_stock (DB primero); sin mínimo
// vale 0 y el job usa el fallback de rotación 7d.
export async function listarCatalogoVivo(tenantId?: string): Promise<ItemVivo[]> {
  const db = dbVivaTenant(tenantId);
  if (!db) return conParticion(tenantId, catalogoVivoMemoria);
  try {
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, stock: products.stockActual, precio: products.precioCentavos, minStock: products.minStock, reorderQty: products.reorderQty })
      .from(products);
    return filas.map((p) => ({
      sku: p.sku,
      nombre: p.nombre,
      stock: p.stock,
      umbral: p.minStock ?? 0,
      precioCentavos: p.precio,
      proveedor: null,
      ...(p.reorderQty != null ? { reorderQty: p.reorderQty } : {}),
    }));
  } catch (e) {
    // Por qué tolera 0027 ausente: una base sin min_stock/reorder_qty lee
    // el resto igual y el umbral queda en 0 (fallback de rotación).
    if (!esUmbralFaltante(e)) conParticion(tenantId, () => crearAlmacenStock()).anteFalloPersistencia(e);
    return conParticion(tenantId, catalogoVivoMemoria);
  }
}

function esUmbralFaltante(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("min_stock") || msg.includes("reorder_qty");
}

// Por qué overlay: el espejo en memoria trae la escritura más reciente
// del proceso (PATCH /api/products); el demo sin ficha queda como hoy.
function catalogoVivoMemoria(): ItemVivo[] {
  const fichas = crearAlmacenProductos().comoMapaSoloLectura();
  const umbrales = new Map<string, { minStock: number | null; reorderQty: number | null }>();
  for (const f of fichas.values()) umbrales.set(f.sku, { minStock: f.minStock, reorderQty: f.reorderQty });
  return catalogo_vivo(crearAlmacenStock().mapaVivo(), crearAlmacenPrecios().mapaVivo(), umbrales);
}

// Sesión corta por número (30 min, sin datos de stock).
export const SESION_TTL_MS = 30 * 60 * 1000;

export interface SesionViva {
  paso: string;
  contexto: Record<string, unknown>;
}

export async function leerSesion(numero: string, ahoraMs: number, tenantId?: string): Promise<SesionViva | null> {
  const db = dbVivaTenant(tenantId);
  if (db) {
    try {
      const filas = await db.select().from(whatsappSessions).where(eq(whatsappSessions.numeroE164, numero)).limit(1);
      const fila = filas[0];
      if (fila) {
        if (fila.expiraEn && ahoraMs > fila.expiraEn.getTime()) return null;
        return { paso: fila.paso, contexto: fila.contexto };
      }
      if (!hayMemoria(tenantId)) return null;
    } catch (e) {
      conParticion(tenantId, () => crearAlmacenWaSessions()).anteFalloPersistencia(e);
    }
  }
  if (!hayMemoria(tenantId)) return null;
  return conParticion(tenantId, () => {
    const mem = crearAlmacenWaSessions().obtener(numero);
    if (!mem || ahoraMs > mem.expiraEn) return null;
    return { paso: mem.paso, contexto: mem.contexto as Record<string, unknown> };
  });
}

export async function guardarSesion(numero: string, paso: string, contexto: Record<string, unknown>, ahoraMs: number, tenantId?: string): Promise<void> {
  const db = dbVivaTenant(tenantId);
  if (db) {
    try {
      await db
        .insert(whatsappSessions)
        .values({ numeroE164: numero, paso, contexto, expiraEn: new Date(ahoraMs + SESION_TTL_MS), updatedAt: new Date(ahoraMs) })
        .onConflictDoUpdate({
          target: whatsappSessions.numeroE164,
          set: { paso, contexto, expiraEn: new Date(ahoraMs + SESION_TTL_MS), updatedAt: new Date(ahoraMs) },
        });
    } catch (e) {
      conParticion(tenantId, () => crearAlmacenWaSessions()).anteFalloPersistencia(e);
    }
  }
  if (!hayMemoria(tenantId)) return;
  conParticion(tenantId, () => {
    crearAlmacenWaSessions().guardar(numero, { paso, contexto, updatedAt: ahoraMs, expiraEn: ahoraMs + SESION_TTL_MS });
  });
}

// waFriday has no table: la lista del viernes vive en memoria del repo.
export function leerListaViernes(tenantId: string, catalogo: ItemVivo[], ahoraMs: number): ListaViernes {
  void ahoraMs;
  const guardados = conParticion(tenantId, () => crearAlmacenWaFriday().obtener(tenantId) ?? []);
  const porSku = new Map(catalogo.map((c) => [c.sku, c]));
  const mapa = new Map<string, ReturnType<typeof crear_item_viernes>[]>();
  for (const g of guardados) {
    const vivo = porSku.get(g.sku);
    if (!vivo || vivo.umbral <= 0 || vivo.stock > vivo.umbral) continue;
    const item = crear_item_viernes({ sku: vivo.sku, nombre: vivo.nombre, stock: vivo.stock, umbral: vivo.umbral, proveedor: vivo.proveedor });
    const arr = mapa.get(item.proveedor) ?? [];
    if (arr.some((i) => i.sku === item.sku)) continue;
    mapa.set(item.proveedor, [...arr, item]);
  }
  return mapa;
}

// waFriday has no table: la lista del viernes vive en memoria del repo.
export function agregarListaViernes(tenantId: string, friday: ListaViernes, ahoraMs: number): void {
  if (!tenantId) return;
  conParticion(tenantId, () => {
    const lista = crearAlmacenWaFriday();
    const previa = lista.obtener(tenantId) ?? [];
    const vistos = new Set(previa.map((g) => g.sku));
    const next = [...previa];
    for (const items of friday.values()) {
      for (const i of items) {
        if (vistos.has(i.sku)) continue;
        vistos.add(i.sku);
        next.push({ sku: i.sku, proveedor: i.proveedor, agregadoEn: ahoraMs });
      }
    }
    lista.guardar(tenantId, next);
  });
}

// Pedidos del tenant a la vista del día a día.
export async function listarPedidosDia(tenantId?: string): Promise<PedidoDia[]> {
  const db = dbVivaTenant(tenantId);
  if (db) {
    try {
      return await pedidosDiaEnDb(db);
    } catch (e) {
      conParticion(tenantId, () => crearAlmacenPurchaseOrders()).anteFalloPersistencia(e);
    }
  }
  if (!hayMemoria(tenantId)) return [];
  return conParticion(tenantId, pedidosDiaEnMemoria);
}

async function pedidosDiaEnDb(db: TenantDb): Promise<PedidoDia[]> {
  const ordenes = await db
    .select({ id: purchaseOrders.id, supplierCuit: purchaseOrders.supplierCuit, estado: purchaseOrders.estado, creadoEn: purchaseOrders.createdAt, total: purchaseOrders.totalCentavos })
    .from(purchaseOrders);
  const provs = await db.select({ cuit: suppliers.cuit, nombre: suppliers.nombre }).from(suppliers);
  const porCuit = new Map(provs.map((p) => [p.cuit, p.nombre]));
  return ordenes.map((o) => ({
    id: o.id,
    proveedor: porCuit.get(o.supplierCuit) ?? o.supplierCuit,
    estado: o.estado === "abierta" ? "borrador" : "enviado",
    creadoEnMs: o.creadoEn.getTime(),
    totalCentavos: o.total,
  }));
}

function pedidosDiaEnMemoria(): PedidoDia[] {
  const ordenes = crearAlmacenPurchaseOrders().mapaVivo();
  const proveedores = crearAlmacenSuppliers().mapaVivo();
  const out: PedidoDia[] = [];
  for (const o of ordenes.values()) {
    const sup = proveedores.get(`sup-${o.supplierCuit}`);
    out.push({
      id: o.id,
      proveedor: sup?.nombre ?? o.supplierCuit,
      estado: o.estado === "abierta" ? "borrador" : "enviado",
      creadoEnMs: Date.parse(o.creadoEn),
      totalCentavos: o.totalCentavos,
    });
  }
  return out;
}

// Movimientos a la vista del día a día.
export async function listarMovimientosVista(ahoraMs: number, tenantId?: string): Promise<MovimientoVista[]> {
  const db = dbVivaTenant(tenantId);
  if (db) {
    try {
      const filas = await db.select({ idemKey: stockMovements.idemKey, sku: stockMovements.sku, delta: stockMovements.delta, tipo: stockMovements.tipo }).from(stockMovements);
      return filas.map((m) => ({ idemKey: m.idemKey, sku: m.sku, delta: m.delta, tipo: m.tipo as MovimientoVista["tipo"], fechaMs: ahoraMs }));
    } catch (e) {
      conParticion(tenantId, () => crearListaMovimientosStock()).anteFalloPersistencia(e);
    }
  }
  if (!hayMemoria(tenantId)) return [];
  return conParticion(tenantId, () =>
    crearListaMovimientosStock()
      .listar()
      .map((m) => ({ idemKey: m.idemKey, sku: m.sku, delta: m.delta, tipo: m.tipo, fechaMs: ahoraMs })),
  );
}

export interface ComercioBot {
  readonly tenantId: string;
  readonly nombreComercio: string;
  readonly googleSub: string;
  readonly numero: string;
  readonly prefs: Preferencias;
}

// PERS2-S18/S19 (ADR-0059): comercios con bot para los jobs. Lee control
// (plano global, no datos del comercio); el job en multi lo llama solo con
// el tenant de gateJob, en single recorre todos como hoy.
export function listarComerciosBot(): ComercioBot[] {
  const out: ComercioBot[] = [];
  for (const [numero, l] of control.botLinks) {
    if (l.estado !== "verificado") continue;
    const t = control.tenants.get(l.tenantId);
    if (!t || (t.estado !== "activo" && t.estado !== "suspendido")) continue;
    const p = control.waPrefs.get(`${l.tenantId}:${l.googleSub}`);
    out.push({
      tenantId: l.tenantId,
      nombreComercio: t.nombreComercio,
      googleSub: l.googleSub,
      numero,
      prefs: { optIn: p?.optIn ?? false, avisoHora: p?.avisoHora ?? "08:00", pausadoHastaMs: p?.pausadoHastaMs ?? null },
    });
  }
  return out;
}

export function obtenerComercioBot(tenantId: string): ComercioBot | null {
  return listarComerciosBot().find((c) => c.tenantId === tenantId) ?? null;
}

// Catálogo del aviso matutino como ItemStock, con DB viva o memoria.
export async function catalogoAvisoVivo(tenantId?: string): Promise<ItemStock[]> {
  const vivos = await listarCatalogoVivo(tenantId);
  return vivos.map((c) => ({
    sku: c.sku,
    nombre: c.nombre,
    stock: c.stock,
    umbral: c.umbral,
    proveedor: c.proveedor ?? null,
    ...(c.reorderQty != null ? { reorderQty: c.reorderQty } : {}),
  }));
}

// waEnviados has no table: las claves de idempotencia WA viven en memoria del repo.
export function waEnviadosVivos(tenantId?: string): Set<string> {
  return conParticion(tenantId, () => crearConjuntoWaEnviados().vivos());
}

// waEnviados has no table: las claves de idempotencia WA viven en memoria del repo.
export function marcarWaEnviado(clave: string, tenantId?: string): void {
  conParticion(tenantId, () => {
    crearConjuntoWaEnviados().agregar(clave);
  });
}

function ventasSemanalesEnMemoria(): { ventas: VentaSemana[]; faltantes: FaltanteSemana[] } {
  const stock = crearAlmacenStock().mapaVivo();
  const precios = crearAlmacenPrecios().mapaVivo();
  const movs = crearListaMovimientosStock().listar();
  const catalogo = catalogo_vivo(stock, precios);
  const porSku = new Map(catalogo.map((c) => [c.sku, c]));
  const ventas = new Map<string, { unidades: number; importe: bigint }>();
  for (const m of movs) {
    if (m.tipo !== "VENTA" || m.delta >= 0) continue;
    const u = -m.delta;
    const precio = BigInt(precios.get(m.sku) ?? 0);
    const e = ventas.get(m.sku) ?? { unidades: 0, importe: 0n };
    ventas.set(m.sku, { unidades: e.unidades + u, importe: e.importe + BigInt(u) * precio });
  }
  return {
    ventas: [...ventas.entries()].map(([sku, v]) => ({
      sku,
      nombre: porSku.get(sku)?.nombre ?? sku,
      unidades: v.unidades,
      importeCentavos: v.importe,
    })),
    faltantes: catalogo
      .filter((c) => c.umbral > 0 && c.stock <= c.umbral)
      .map((c) => ({ sku: c.sku, nombre: c.nombre, stock: c.stock, umbral: c.umbral, proveedor: c.proveedor ?? null })),
  };
}

// Cálculo semanal en memoria (misma cuenta que hoy); lo usa la ruta para la
// exportación síncrona y como fallback sin base.
export function calculoSemanalMemoria(tenantId?: string): CalculoSemanal {
  return conParticion(tenantId, () => {
    const { ventas, faltantes } = ventasSemanalesEnMemoria();
    return calcular_semanal({ ventas, faltantes });
  });
}

// Resumen semanal vivo (NE3.1/B9.1): products + stock_movements con DB viva,
// memoria particionada solo en single sin base. En multi sin base propaga.
export async function calculoSemanalVivo(tenantId?: string): Promise<CalculoSemanal> {
  const db = dbVivaTenant(tenantId);
  if (!db) return calculoSemanalMemoria(tenantId);
  try {
    const prods = await db
      .select({ sku: products.sku, nombre: products.nombre, precio: products.precioCentavos })
      .from(products);
    const movs = await db
      .select({ sku: stockMovements.sku, delta: stockMovements.delta, tipo: stockMovements.tipo })
      .from(stockMovements);
    const porSku = new Map(prods.map((p) => [p.sku, p]));
    const ventas = new Map<string, { unidades: number; importe: bigint }>();
    for (const m of movs) {
      if (m.tipo !== "VENTA" || m.delta >= 0) continue;
      const u = -m.delta;
      const precio = porSku.get(m.sku)?.precio ?? 0n;
      const e = ventas.get(m.sku) ?? { unidades: 0, importe: 0n };
      ventas.set(m.sku, { unidades: e.unidades + u, importe: e.importe + BigInt(u) * precio });
    }
    return calcular_semanal({
      ventas: [...ventas.entries()].map(([sku, v]) => ({
        sku,
        nombre: porSku.get(sku)?.nombre ?? sku,
        unidades: v.unidades,
        importeCentavos: v.importe,
      })),
      faltantes: [],
    });
  } catch (e) {
    conParticion(tenantId, () => crearAlmacenStock()).anteFalloPersistencia(e);
    return calculoSemanalMemoria(tenantId);
  }
}
