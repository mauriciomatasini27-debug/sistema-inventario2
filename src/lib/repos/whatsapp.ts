import { and, eq, isNull, like } from "drizzle-orm";
import { dondeTenant, filaConTenant } from "../tenant-scope.js";
import { products, stockMovements } from "../../db/schema.js";
import { notificationEvents, type AlertaStockPayload } from "../../db/schema-email.js";
import { purchaseOrders } from "../../db/schema-proveedores.js";
import { suppliers } from "../../db/schema-proveedores.js";
import { productAliases, whatsappSessions } from "../../db/schema-whatsapp.js";
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
import { clave_alerta_stock } from "../../modules/alertas/stock-bajo.js";
import { catalogo_vivo } from "../../modules/whatsapp/catalogo.js";
import { crear_item_viernes, type ListaViernes } from "../../modules/whatsapp/lista-viernes.js";
import type { MovimientoVista, PedidoDia } from "../../modules/whatsapp/dia-a-dia.js";
import type { ItemVivo } from "../../modules/whatsapp/servicio.js";
import type { FuenteTurno } from "../../modules/bot/historial.js";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// BOT2 alias: product_aliases es compartida por comercios, products no.
// El tenant explícito manda; sin él vale el contexto del request. En single
// el tenant legado ("slice0") no es uuid y los alias viven con tenant_id null.
async function aliasesPorSku(db: TenantDb, tenantId?: string): Promise<Map<string, string[]>> {
  const tenant = tenantId ?? tenantActual();
  const filas = await db
    .select({ sku: productAliases.sku, aliasNorm: productAliases.aliasNorm })
    .from(productAliases)
    .where(tenant && UUID.test(tenant) ? eq(productAliases.tenantId, tenant) : isNull(productAliases.tenantId));
  const porSku = new Map<string, string[]>();
  for (const f of filas) {
    const lista = porSku.get(f.sku) ?? [];
    lista.push(f.aliasNorm);
    porSku.set(f.sku, lista);
  }
  return porSku;
}

// Catálogo vivo para el webhook (misma forma que Drizzle en prod).
// ALR-S1: el umbral sale de products.min_stock (DB primero); sin mínimo
// vale 0 y el job usa el fallback de rotación 7d.
export async function listarCatalogoConFuente(tenantId?: string): Promise<{ items: ItemVivo[]; fuente: FuenteTurno }> {
  const db = dbVivaTenant(tenantId);
  if (!db) return { items: conParticion(tenantId, catalogoVivoMemoria), fuente: "memoria" };
  try {
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, stock: products.stockActual, precio: products.precioCentavos, minStock: products.minStock, reorderQty: products.reorderQty })
      .from(products);
    const aliases = await aliasesPorSku(db, tenantId);
    return {
      items: filas.map((p) => ({
        sku: p.sku,
        nombre: p.nombre,
        stock: p.stock,
        umbral: p.minStock ?? 0,
        precioCentavos: p.precio,
        proveedor: null,
        alias: aliases.get(p.sku) ?? [],
        ...(p.reorderQty != null ? { reorderQty: p.reorderQty } : {}),
      })),
      fuente: "db",
    };
  } catch (e) {
    if (!esUmbralFaltante(e)) conParticion(tenantId, () => crearAlmacenStock()).anteFalloPersistencia(e);
    return { items: conParticion(tenantId, catalogoVivoMemoria), fuente: "memoria" };
  }
}

export async function listarCatalogoVivo(tenantId?: string): Promise<ItemVivo[]> {
  return (await listarCatalogoConFuente(tenantId)).items;
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

// ALR-S2: alertas de stock ya enviadas. La clave completa ya particiona por
// tenant+fecha+sku, así que un solo mapa alcanza para todos los comercios.
const alertasStockMemoria = new Map<string, AlertaStockPayload>();

export function limpiarAlertasStockMemoria(): void {
  alertasStockMemoria.clear();
}

function skuDesdeClaveAlerta(clave: string, prefijo: string, sufijo: string): string | null {
  if (!clave.startsWith(prefijo) || !clave.endsWith(sufijo)) return null;
  const sku = clave.slice(prefijo.length, clave.length - sufijo.length);
  return sku.length > 0 ? sku : null;
}

// SKUs ya alertados hoy: memoria primero y notification_events cuando hay DB.
// Un fallo de base no corta el job, solo deja la memoria como fuente.
export async function alertasPreviasDelDia(tenantId: string, fecha: string): Promise<Set<string>> {
  const prefijo = `alerta_stock:${tenantId}:`;
  const sufijo = `:${fecha}`;
  const out = new Set<string>();
  for (const [clave, p] of alertasStockMemoria) {
    if (clave.startsWith(prefijo) && clave.endsWith(sufijo)) out.add(p.sku);
  }
  let db: TenantDb | null = null;
  try {
    db = dbVivaTenant(tenantId);
  } catch (e) {
    console.warn("[whatsapp] alertas previas sin DB, uso memoria", e);
  }
  if (!db) return out;
  try {
    const filas = await db
      .select({ dedupeKey: notificationEvents.dedupeKey, refId: notificationEvents.refId })
      .from(notificationEvents)
      .where(
        dondeTenant(
          notificationEvents.tenantId,
          and(
            eq(notificationEvents.tipo, "alerta_stock"),
            like(notificationEvents.dedupeKey, `${prefijo}%`),
            like(notificationEvents.dedupeKey, `%${sufijo}`),
          ),
        ),
      );
    for (const f of filas) {
      const sku = f.refId ?? skuDesdeClaveAlerta(f.dedupeKey, prefijo, sufijo);
      if (sku) out.add(sku);
    }
  } catch (e) {
    console.warn("[whatsapp] alertas previas: fallo de DB, uso memoria", e);
  }
  return out;
}

// Escribe memoria primero y best-effort en notification_events (dedupeKey
// único). Un fallo de DB no lanza: el job sigue con la memoria del proceso.
export async function registrarAlertasStock(
  tenantId: string,
  fecha: string,
  alertas: ReadonlyArray<Omit<AlertaStockPayload, "fecha">>,
): Promise<void> {
  if (alertas.length === 0) return;
  const payloads: AlertaStockPayload[] = alertas.map((a) => ({
    sku: a.sku,
    nombre: a.nombre,
    stock: a.stock,
    umbral: a.umbral,
    urgente: a.urgente,
    fecha,
    canal: a.canal === "email" ? "email" : "whatsapp",
  }));
  for (const p of payloads) alertasStockMemoria.set(clave_alerta_stock(tenantId, p.sku, fecha), p);
  let db: TenantDb | null = null;
  try {
    db = dbVivaTenant(tenantId);
  } catch (e) {
    console.warn("[whatsapp] registrar alertas stock sin DB, queda en memoria", e);
    return;
  }
  if (!db) return;
  try {
    await db
      .insert(notificationEvents)
      .values(
        payloads.map((p) =>
          filaConTenant({
            tipo: "alerta_stock",
            version: 1,
            refTipo: "producto",
            refId: p.sku,
            payload: p,
            dedupeKey: clave_alerta_stock(tenantId, p.sku, fecha),
            estado: "enviado",
          }),
        ),
      )
      .onConflictDoNothing({ target: [notificationEvents.tenantId, notificationEvents.dedupeKey] });
  } catch (e) {
    console.warn("[whatsapp] registrar alertas stock: fallo de DB, queda en memoria", e);
  }
}

function esUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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

// DASH-S6: historial de alertas de stock del comercio, una fila por
// dedupe_key (los reintentos del job no duplican). Memoria + DB, más nuevas primero.
export interface FilaHistorialAlerta extends AlertaStockPayload {
  readonly clave: string;
  readonly registradaAt: string | null;
  readonly estado: string;
}

// DASH-S6: el único escritor anterior a `canal` es el aviso de WhatsApp.
export function canalAlerta(canal: string | undefined): "whatsapp" | "email" {
  return canal === "email" ? "email" : "whatsapp";
}

export async function leerAlertaStock(
  tenantId: string,
  sku: string,
  fecha: string,
): Promise<AlertaStockPayload | null> {
  const clave = clave_alerta_stock(tenantId, sku, fecha);
  let payload: AlertaStockPayload | null = alertasStockMemoria.get(clave) ?? null;
  let db: TenantDb | null = null;
  try {
    db = dbVivaTenant(tenantId);
  } catch (e) {
    console.warn("[alertas] leer alerta sin DB, uso memoria", e);
  }
  if (db) {
    try {
      const filas = await db
        .select({ payload: notificationEvents.payload })
        .from(notificationEvents)
        .where(eq(notificationEvents.dedupeKey, clave))
        .limit(1);
      if (filas[0]) payload = filas[0].payload as AlertaStockPayload;
    } catch (e) {
      console.warn("[alertas] leer alerta: fallo de DB, uso memoria", e);
    }
  }
  return payload;
}

export async function historialAlertasStock(tenantId: string, limite = 200): Promise<FilaHistorialAlerta[]> {
  const prefijo = `alerta_stock:${tenantId}:`;
  const porClave = new Map<string, FilaHistorialAlerta>();
  for (const [clave, p] of alertasStockMemoria) {
    if (clave.startsWith(prefijo)) {
      porClave.set(clave, { ...p, canal: canalAlerta(p.canal), clave, registradaAt: null, estado: "enviado" });
    }
  }
  let db: TenantDb | null = null;
  try {
    db = dbVivaTenant(tenantId);
  } catch (e) {
    console.warn("[alertas] historial sin DB, uso memoria", e);
  }
  if (db) {
    try {
      const filas = await db
        .select({
          dedupeKey: notificationEvents.dedupeKey,
          payload: notificationEvents.payload,
          createdAt: notificationEvents.createdAt,
          estado: notificationEvents.estado,
        })
        .from(notificationEvents)
        .where(and(eq(notificationEvents.tipo, "alerta_stock"), like(notificationEvents.dedupeKey, `${prefijo}%`)));
      for (const f of filas) {
        const p = f.payload as AlertaStockPayload;
        porClave.set(f.dedupeKey, {
          ...p,
          canal: canalAlerta(p.canal),
          clave: f.dedupeKey,
          registradaAt: f.createdAt ? new Date(f.createdAt).toISOString() : null,
          estado: f.estado,
        });
      }
    } catch (e) {
      console.warn("[alertas] historial: fallo de DB, uso memoria", e);
    }
  }
  return [...porClave.values()]
    .sort((a, b) => (a.fecha === b.fecha ? a.sku.localeCompare(b.sku) : a.fecha < b.fecha ? 1 : -1))
    .slice(0, limite);
}
