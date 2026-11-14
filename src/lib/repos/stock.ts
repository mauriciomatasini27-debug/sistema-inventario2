import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { products, stockCounts, stockCountLines, stockLots, stockMovements } from "../../db/schema.js";
import type { Lote, LotId, Sku } from "../../modules/inventario/inventario.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import { dondeTenant, tenantIdShared } from "../tenant-scope.js";
import {
  crearAlmacenConteoVistos,
  crearAlmacenSectores,
  crearAlmacenStock,
  crearListaAuditoria,
  crearListaConteos,
  crearListaMovimientosStock,
  type AlmacenVivo,
  type ConteoStock,
  type ListaAlmacen,
  type StoredStockMovement,
} from "./_almacen.js";
import { conteo_por_sector, normalizarSector, type LineaFisica } from "../../modules/inventario/sectores.js";

// PERS2-S23 (ADR-0062): stock, movimientos y conteos. Los movimientos de
// stock se escriben solo por este modulo. DB primero via dbVivaTenant();
// solo en single sin base usa la memoria particionada. En multi sin base
// dbVivaTenant lanza BaseNoDisponible y se propaga (la ruta responde 503).

// Por qué código 23505: dos altas con la misma key compiten y la DB dirime.
function esChoqueIdemKey(e: unknown): boolean {
  if (typeof (e as { code?: unknown }).code === "string" && (e as { code: string }).code === "23505") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("stock_counts_idem_key_unique");
}

async function sectoresDeDb(db: TenantDb, skus: readonly string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (skus.length === 0) return mapa;
  const w = dondeTenant(products.tenantId, inArray(products.sku, [...skus]));
  const filas = await db
    .select({ sku: products.sku, sector: products.sector })
    .from(products)
    .where(w ?? inArray(products.sku, [...skus]));
  for (const f of filas) mapa.set(f.sku, normalizarSector(f.sector));
  return mapa;
}

type DiferenciaConteo = { sku: string; teorico: number; fisico: number; diferencia: number };

function diferenciasDe(lineas: ReadonlyArray<{ sku: string; fisico: number }>, existencias: AlmacenVivo<number>): DiferenciaConteo[] {
  return lineas.map((l) => {
    const sku = l.sku.trim().toUpperCase();
    const teorico = existencias.obtener(sku) ?? 0;
    return { sku, teorico, fisico: l.fisico, diferencia: l.fisico - teorico };
  });
}

function espejarCrearConteo(
  conteo: ConteoStock,
  key: string,
  conteos: ListaAlmacen<ConteoStock>,
  vistos: AlmacenVivo<string>,
): void {
  conteos.agregar(conteo);
  vistos.guardar(key, conteo.id);
}

function espejarConteoSector(
  id: string,
  key: string,
  sector: string,
  diferencias: DiferenciaConteo[],
  conteos: ListaAlmacen<ConteoStock>,
  vistos: AlmacenVivo<string>,
): void {
  conteos.agregar({ id, sector, idemKey: key, creadoEn: new Date().toISOString(), diferencias });
  vistos.guardar(key, id);
}

export type TipoMovimientoStock = "ALTA" | "VENTA" | "COMPENSATORIO" | "MERMA" | "AJUSTE_CONTEO";
// P1-60: la VENTA no entra por aplicarMovimiento. Ese camino abre otra
// conexión, no baja cantidad_restante y, si la base falla, espeja memoria y sigue.
export type TipoMovimientoNoVenta = Exclude<TipoMovimientoStock, "VENTA">;

export interface MovimientoStockNuevo {
  readonly idemKey: string;
  readonly sku: string;
  readonly loteId: string | null;
  readonly delta: number;
  readonly tipo: TipoMovimientoNoVenta;
  readonly motivo?: string | undefined;
}

// Por qué espejo: la memoria del proceso sigue hasta el retiro (P2.2).
export interface ConteoRegistrado {
  id: string;
  sector: string;
  idemKey: string;
  creadoEn: string;
  diferencias: Array<{ sku: string; teorico: number; fisico: number; diferencia: number }>;
}

export async function movimientoDuplicado(idemKey: string, tipo: TipoMovimientoStock): Promise<boolean> {
  const movimientos = crearListaMovimientosStock();
  if (movimientos.listar().some((m) => m.idemKey === idemKey && m.tipo === tipo)) return true;
  const db = dbVivaTenant();
  if (!db) return false;
  try {
    const w =
      dondeTenant(stockMovements.tenantId, eq(stockMovements.idemKey, idemKey)) ?? eq(stockMovements.idemKey, idemKey);
    const filas = await db.select({ id: stockMovements.id }).from(stockMovements).where(w).limit(1);
    return Boolean(filas[0]);
  } catch (e) {
    movimientos.anteFalloPersistencia(e);
    return false;
  }
}

// Escritura unica de movimientos: espejo memoria + stock_movements durable +
// products.stock_actual. En multi sin base propaga BaseNoDisponible.
export async function aplicarMovimiento(m: MovimientoStockNuevo): Promise<{ fuente: "db" | "memoria" }> {
  const registro: StoredStockMovement = {
    idemKey: m.idemKey,
    sku: m.sku,
    loteId: m.loteId,
    delta: m.delta,
    tipo: m.tipo,
    ...(m.motivo !== undefined ? { motivo: m.motivo } : {}),
  };
  const existencias = crearAlmacenStock();
  const movimientos = crearListaMovimientosStock();
  const db = dbVivaTenant();
  if (!db) {
    aplicarEnMemoria(registro, existencias, movimientos);
    return { fuente: "memoria" };
  }
  try {
    const tid = tenantIdShared();
    await db.insert(stockMovements).values({
      idemKey: m.idemKey,
      sku: m.sku,
      loteId: m.loteId,
      delta: m.delta,
      tipo: m.tipo,
      ...(m.motivo !== undefined ? { motivo: m.motivo } : {}),
      ...(tid ? { tenantId: tid } : {}),
    });
    const wProd = dondeTenant(products.tenantId, eq(products.sku, m.sku)) ?? eq(products.sku, m.sku);
    await db
      .update(products)
      .set({ stockActual: sql`${products.stockActual} + ${m.delta}` })
      .where(wProd);
    aplicarEnMemoria(registro, existencias, movimientos);
    return { fuente: "db" };
  } catch (e) {
    movimientos.anteFalloPersistencia(e);
    aplicarEnMemoria(registro, existencias, movimientos);
    return { fuente: "memoria" };
  }
}

export function aplicarEnMemoria(
  m: StoredStockMovement,
  existencias: AlmacenVivo<number>,
  movimientos: ListaAlmacen<StoredStockMovement>,
): void {
  existencias.guardar(m.sku, (existencias.obtener(m.sku) ?? 0) + m.delta);
  movimientos.agregar(m);
}

/** Tx que ya abrió el caller de la venta; esta API no abre otra. */
export type TxVentaAbierta = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

export interface PedidoLotesVenta {
  readonly skus: readonly string[];
  readonly offline: boolean;
  readonly ahora: Date;
}

export interface TomaLoteVenta {
  readonly loteId: string;
  readonly sku: string;
  readonly cantidad: number;
}

export interface ConsumoVentaLotes {
  readonly idemKey: string;
  readonly tomas: readonly TomaLoteVenta[];
  /** false: anota tomas en movimientos y no baja restante ni stock_actual. */
  readonly bajarCantidades: boolean;
}

const UUID_LOTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loteIdParaFila(id: string): string | null {
  return UUID_LOTE.test(id) ? id : null;
}

function validarConsumoVenta(lotes: readonly Lote[], consumo: ConsumoVentaLotes): void {
  if (!consumo.idemKey) throw new Error("consumo de venta inválido");
  const porId = new Map(lotes.map((l) => [l.id as string, l]));
  const vistos = new Set<string>();
  for (const t of consumo.tomas) {
    const lote = porId.get(t.loteId);
    if (!lote || vistos.has(t.loteId) || t.sku !== lote.sku) throw new Error("consumo de venta inválido");
    vistos.add(t.loteId);
    if (!Number.isInteger(t.cantidad) || t.cantidad < 1 || t.cantidad > lote.cantidad) {
      throw new Error("consumo de venta inválido");
    }
  }
}

// P1-60: única escritura de una VENTA. Primero products.sku y después
// stock_lots.id, siempre en ese orden, para que dos cobros no se traben.
// La semilla existe solo si el SKU no tiene ninguna fila de lote.
export async function aplicarVentaLotes<T>(
  tx: TxVentaAbierta,
  pedido: PedidoLotesVenta,
  decidir: (lotes: readonly Lote[]) => Promise<{ readonly consumo: ConsumoVentaLotes; readonly valor: T }>,
): Promise<T> {
  const skus = [...new Set(pedido.skus)].sort();
  const lotes: Lote[] = [];
  if (skus.length > 0) {
    const wProd = dondeTenant(products.tenantId, inArray(products.sku, skus));
    const bloqueados = await tx
      .select({ sku: products.sku, stockActual: products.stockActual })
      .from(products)
      .where(wProd ?? inArray(products.sku, skus))
      .orderBy(asc(products.sku))
      .for("update");
    const wLotes = dondeTenant(stockLots.tenantId, inArray(stockLots.sku, skus));
    const filasLote = await tx
      .select({
        id: stockLots.id,
        sku: stockLots.sku,
        cantidadRestante: stockLots.cantidadRestante,
        venceEl: stockLots.venceEl,
        costoCentavos: stockLots.costoCentavos,
      })
      .from(stockLots)
      .where(wLotes ?? inArray(stockLots.sku, skus))
      .orderBy(asc(stockLots.id))
      .for("update");
    const porSku = new Map<string, typeof filasLote>();
    for (const fila of filasLote) {
      const arr = porSku.get(fila.sku);
      if (arr) arr.push(fila);
      else porSku.set(fila.sku, [fila]);
    }
    const stockDe = new Map(bloqueados.map((p) => [p.sku, p.stockActual]));
    for (const sku of skus) {
      const filas = porSku.get(sku) ?? [];
      if (filas.length === 0) {
        const stock = stockDe.get(sku) ?? 0;
        if (stock > 0) {
          lotes.push({
            id: `seed-${sku}` as LotId,
            sku: sku as Sku,
            cantidad: stock,
            venceEl: null,
            costoCentavos: 0n,
          });
        }
        continue;
      }
      for (const fila of filas) {
        if (fila.cantidadRestante <= 0) continue;
        if (!pedido.offline && fila.venceEl !== null && fila.venceEl.getTime() < pedido.ahora.getTime()) continue;
        lotes.push({
          id: fila.id as LotId,
          sku: fila.sku as Sku,
          cantidad: fila.cantidadRestante,
          venceEl: fila.venceEl,
          costoCentavos: fila.costoCentavos,
        });
      }
    }
  }
  const { consumo, valor } = await decidir(lotes);
  validarConsumoVenta(lotes, consumo);
  if (consumo.tomas.length > 0) {
    // P1-61: el orden FEFO vive en tomas[]; createdAt es el instante de la venta.
    await tx.insert(stockMovements).values(
      consumo.tomas.map((t) => ({
        idemKey: consumo.idemKey,
        sku: t.sku,
        loteId: loteIdParaFila(t.loteId),
        delta: -t.cantidad,
        tipo: "VENTA" as const,
        createdAt: pedido.ahora,
      })),
    );
  }
  if (consumo.bajarCantidades) {
    const porSku = new Map<string, number>();
    for (const t of consumo.tomas) {
      const loteId = loteIdParaFila(t.loteId);
      if (loteId) {
        const updated = await tx
          .update(stockLots)
          .set({ cantidadRestante: sql`${stockLots.cantidadRestante} - ${t.cantidad}` })
          .where(and(eq(stockLots.id, loteId), sql`${stockLots.cantidadRestante} >= ${t.cantidad}`))
          .returning({ id: stockLots.id });
        if (!updated[0]) throw new Error("el lote no alcanzó para la toma");
      }
      porSku.set(t.sku, (porSku.get(t.sku) ?? 0) + t.cantidad);
    }
    for (const [sku, cantidad] of porSku) {
      await tx
        .update(products)
        .set({ stockActual: sql`${products.stockActual} - ${cantidad}` })
        .where(eq(products.sku, sku));
    }
  }
  return valor;
}

export function nivelStock(sku: string): number {
  return crearAlmacenStock().obtener(sku) ?? 0;
}

export async function listarMovimientos(): Promise<StoredStockMovement[]> {
  const movimientos = crearListaMovimientosStock();
  const enMemoria = movimientos.listar();
  const db = dbVivaTenant();
  if (!db) return [...enMemoria];
  try {
    const filas = await db.select().from(stockMovements);
    const union = new Map<string, StoredStockMovement>();
    for (const m of enMemoria) union.set(`${m.tipo}:${m.idemKey}:${m.sku}`, m);
    for (const f of filas) {
      union.set(`${f.tipo}:${f.idemKey}:${f.sku}`, {
        idemKey: f.idemKey,
        sku: f.sku,
        loteId: f.loteId,
        delta: f.delta,
        tipo: f.tipo as TipoMovimientoStock,
        ...(f.motivo != null ? { motivo: f.motivo } : {}),
      });
    }
    return [...union.values()];
  } catch (e) {
    movimientos.anteFalloPersistencia(e);
    return [...enMemoria];
  }
}

export interface CrearConteoInput {
  readonly key: string;
  readonly contadoPor: string;
  readonly lineas: ReadonlyArray<{ sku: string; fisico: number }>;
}

export type CrearConteoResultado =
  | { ok: true; id: string; diferencias: Array<{ sku: string; teorico: number; fisico: number; diferencia: number }> }
  | { ok: false; codigo: "DUPLICADO"; error: string; original: unknown };

export async function crearConteo(input: CrearConteoInput): Promise<CrearConteoResultado> {
  const conteos = crearListaConteos();
  const vistos = crearAlmacenConteoVistos();
  const existencias = crearAlmacenStock();
  const dupMemoria = conteos.listar().find((c) => c.idemKey === input.key);
  if (dupMemoria) return { ok: false, codigo: "DUPLICADO", error: "duplicado", original: dupMemoria };
  const diferencias = diferenciasDe(input.lineas, existencias);
  const db = dbVivaTenant();
  if (db) {
    try {
      const previas = await db.select({ id: stockCounts.id }).from(stockCounts).where(eq(stockCounts.idemKey, input.key)).limit(1);
      if (previas[0]) {
        return { ok: false, codigo: "DUPLICADO", error: "duplicado", original: { id: previas[0].id, idemKey: input.key } };
      }
      const id = crypto.randomUUID();
      await db.insert(stockCounts).values({ id, idemKey: input.key, sector: "general", estado: "en_curso", contadoPor: input.contadoPor });
      for (const d of diferencias) {
        await db.insert(stockCountLines).values({ countId: id, sku: d.sku, teorico: d.teorico, fisico: d.fisico });
      }
      espejarCrearConteo({ id, sector: "general", idemKey: input.key, creadoEn: new Date().toISOString(), diferencias, estado: "en_curso" as const, contadoPor: input.contadoPor }, input.key, conteos, vistos);
      return { ok: true, id, diferencias };
    } catch (e) {
      if (esChoqueIdemKey(e)) {
        return { ok: false, codigo: "DUPLICADO", error: "duplicado", original: { idemKey: input.key } };
      }
      conteos.anteFalloPersistencia(e);
    }
  }
  const id = crypto.randomUUID();
  espejarCrearConteo({ id, sector: "general", idemKey: input.key, creadoEn: new Date().toISOString(), diferencias, estado: "en_curso" as const, contadoPor: input.contadoPor }, input.key, conteos, vistos);
  return { ok: true, id, diferencias };
}

export interface ConfirmarConteoInput {
  readonly id: string;
  readonly rol: "empleado" | "dueno";
  readonly confirmadoPor: string;
  readonly motivo?: string | undefined;
}

export type ConfirmarConteoResultado =
  | { ok: true; id: string; estado: "listo_revisar" | "confirmado" }
  | { ok: false; codigo: "DESCONOCIDO" | "MOTIVO_REQUERIDO"; error: string };

export async function confirmarConteo(input: ConfirmarConteoInput): Promise<ConfirmarConteoResultado> {
  const conteos = crearListaConteos();
  const auditoria = crearListaAuditoria();
  const enMemoria = conteos.listar().find((x) => x.id === input.id);
  const db = dbVivaTenant();
  if (db) {
    try {
      const cab = await db.select().from(stockCounts).where(eq(stockCounts.id, input.id)).limit(1);
      const fila = cab[0];
      if (fila) {
        const contadoPor = fila.contadoPor ?? enMemoria?.contadoPor ?? "";
        if (input.rol === "empleado") {
          await db.update(stockCounts).set({ estado: "listo_revisar" }).where(eq(stockCounts.id, input.id));
          if (enMemoria) enMemoria.estado = "listo_revisar";
          auditoria.agregar({ accion: "conteo_listo_revisar", countId: input.id, contadoPor, confirmadoPor: input.confirmadoPor });
          return { ok: true, id: input.id, estado: "listo_revisar" };
        }
        if (!input.motivo) return { ok: false, codigo: "MOTIVO_REQUERIDO", error: "confirmar exige motivo" };
        const lineas = await db.select().from(stockCountLines).where(eq(stockCountLines.countId, input.id));
        await db.update(stockCounts).set({ estado: "confirmado", confirmadoPor: input.confirmadoPor }).where(eq(stockCounts.id, input.id));
        // Por qué key por línea: la misma key para varias líneas chocaría en el dedup.
        for (const l of lineas) {
          const dif = l.fisico - l.teorico;
          if (dif !== 0) {
            await aplicarMovimiento({ idemKey: `conteo:${input.id}:${l.sku}`, sku: l.sku, loteId: null, delta: dif, tipo: "AJUSTE_CONTEO", motivo: input.motivo });
          }
        }
        if (enMemoria) enMemoria.estado = "confirmado";
        auditoria.agregar({ accion: "conteo_confirmado", countId: input.id, contadoPor, confirmadoPor: input.confirmadoPor, motivo: input.motivo });
        return { ok: true, id: input.id, estado: "confirmado" };
      }
      if (!enMemoria) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    } catch (e) {
      conteos.anteFalloPersistencia(e);
    }
  }
  if (!enMemoria) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
  const contadoPor = enMemoria.contadoPor ?? "";
  if (input.rol === "empleado") {
    enMemoria.estado = "listo_revisar";
    auditoria.agregar({ accion: "conteo_listo_revisar", countId: input.id, contadoPor, confirmadoPor: input.confirmadoPor });
    return { ok: true, id: input.id, estado: "listo_revisar" };
  }
  if (!input.motivo) return { ok: false, codigo: "MOTIVO_REQUERIDO", error: "confirmar exige motivo" };
  enMemoria.estado = "confirmado";
  for (const d of enMemoria.diferencias) {
    if (d.diferencia !== 0) {
      await aplicarMovimiento({ idemKey: `conteo:${input.id}:${d.sku}`, sku: d.sku, loteId: null, delta: d.diferencia, tipo: "AJUSTE_CONTEO", motivo: input.motivo });
    }
  }
  auditoria.agregar({ accion: "conteo_confirmado", countId: input.id, contadoPor, confirmadoPor: input.confirmadoPor, motivo: input.motivo });
  return { ok: true, id: input.id, estado: "confirmado" };
}

export interface ConteoSectorInput {
  readonly key: string;
  readonly sector: string;
  readonly fisico: ReadonlyArray<LineaFisica>;
  readonly motivo?: string | undefined;
}

export type ConteoSectorResultado =
  | { ok: true; conteoId: string; sector: string; diferencias: unknown; movimientos: number; unidadesAjuste: number }
  | { ok: false; codigo: "DUPLICADO"; conteoId: string }
  | { ok: false; codigo: "LINEA_INVALIDA" | "SECTOR_INVALIDO" | "SIN_IDEMKEY"; error: string };

export async function conteoPorSector(input: ConteoSectorInput): Promise<ConteoSectorResultado> {
  const conteos = crearListaConteos();
  const vistos = crearAlmacenConteoVistos();
  const existencias = crearAlmacenStock();
  const sectores = crearAlmacenSectores();
  const visto = vistos.obtener(input.key);
  if (visto !== undefined) return { ok: false, codigo: "DUPLICADO", conteoId: visto };
  const db = dbVivaTenant();
  const sectorDe = new Map(sectores.mapaVivo());
  if (db) {
    try {
      const deDb = await sectoresDeDb(db, input.fisico.map((l) => l.sku));
      for (const [sku, sector] of deDb) sectorDe.set(sku, sector);
    } catch (e) {
      conteos.anteFalloPersistencia(e);
    }
  }
  const r = conteo_por_sector(
    input.motivo === undefined
      ? { teorico: existencias.mapaVivo(), fisico: [...input.fisico], sectorDe, sector: input.sector, idemKey: input.key }
      : { teorico: existencias.mapaVivo(), fisico: [...input.fisico], sectorDe, sector: input.sector, idemKey: input.key, motivo: input.motivo },
  );
  if (!r.ok) return { ok: false, codigo: r.codigo, error: r.codigo };
  const diferencias: DiferenciaConteo[] = r.valor.diferencias.map((d) => ({
    sku: d.sku as string,
    teorico: d.teorico,
    fisico: d.fisico,
    diferencia: d.diferencia,
  }));
  if (db) {
    try {
      const previas = await db.select({ id: stockCounts.id }).from(stockCounts).where(eq(stockCounts.idemKey, input.key)).limit(1);
      if (previas[0]) return { ok: false, codigo: "DUPLICADO", conteoId: previas[0].id };
      const id = crypto.randomUUID();
      await db.insert(stockCounts).values({ id, idemKey: input.key, sector: r.valor.sector, estado: "confirmado" });
      for (const d of diferencias) {
        await db.insert(stockCountLines).values({ countId: id, sku: d.sku, teorico: d.teorico, fisico: d.fisico });
      }
      for (const m of r.valor.movimientos) {
        await aplicarMovimiento({ idemKey: m.idemKey, sku: m.sku as string, loteId: m.loteId as string | null, delta: m.delta, tipo: m.tipo as TipoMovimientoNoVenta, ...(m.motivo ? { motivo: m.motivo } : {}) });
      }
      espejarConteoSector(id, input.key, r.valor.sector, diferencias, conteos, vistos);
      return { ok: true, conteoId: id, sector: r.valor.sector, diferencias: r.valor.diferencias, movimientos: r.valor.movimientos.length, unidadesAjuste: r.valor.unidadesAjuste };
    } catch (e) {
      if (esChoqueIdemKey(e)) {
        try {
          const rival = await db.select({ id: stockCounts.id }).from(stockCounts).where(eq(stockCounts.idemKey, input.key)).limit(1);
          return { ok: false, codigo: "DUPLICADO", conteoId: rival[0]?.id ?? "" };
        } catch {
          conteos.anteFalloPersistencia(e);
        }
      } else {
        conteos.anteFalloPersistencia(e);
      }
    }
  }
  for (const m of r.valor.movimientos) {
    await aplicarMovimiento({ idemKey: m.idemKey, sku: m.sku as string, loteId: m.loteId as string | null, delta: m.delta, tipo: m.tipo as TipoMovimientoNoVenta, ...(m.motivo ? { motivo: m.motivo } : {}) });
  }
  const id = crypto.randomUUID();
  espejarConteoSector(id, input.key, r.valor.sector, diferencias, conteos, vistos);
  return { ok: true, conteoId: id, sector: r.valor.sector, diferencias: r.valor.diferencias, movimientos: r.valor.movimientos.length, unidadesAjuste: r.valor.unidadesAjuste };
}
