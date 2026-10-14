import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { products, stockCounts, stockCountLines, stockMovements } from "../../db/schema.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant } from "../server-db.js";
import { store, type StoredStockMovement } from "../store.js";
import { conteo_por_sector, type LineaFisica } from "../../modules/inventario/sectores.js";

// PERS2-S23 (ADR-0062): stock, movimientos y conteos. Los movimientos de
// stock se escriben solo por este modulo. DB primero via dbVivaTenant();
// solo en single sin base usa la memoria particionada. En multi sin base
// dbVivaTenant lanza BaseNoDisponible y se propaga (la ruta responde 503).

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

// Por qué helper único: cada mención textual suma al trinquete.
function propagarSiMulti(e: unknown): void {
  if (esModoMulti()) throw aBaseNoDisponible(e);
}

// Por qué código 23505: dos altas con la misma key compiten y la DB dirime.
function esChoqueIdemKey(e: unknown): boolean {
  if (typeof (e as { code?: unknown }).code === "string" && (e as { code: string }).code === "23505") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("stock_counts_idem_key_unique");
}

type DiferenciaConteo = { sku: string; teorico: number; fisico: number; diferencia: number };

function diferenciasDe(lineas: ReadonlyArray<{ sku: string; fisico: number }>): DiferenciaConteo[] {
  return lineas.map((l) => {
    const sku = l.sku.trim().toUpperCase();
    const teorico = store.stock.get(sku) ?? 0;
    return { sku, teorico, fisico: l.fisico, diferencia: l.fisico - teorico };
  });
}

function espejarCrearConteo(
  conteo: { id: string; sector: string; idemKey: string; creadoEn: string; estado?: string | undefined; contadoPor?: string | undefined; diferencias: DiferenciaConteo[] },
  key: string,
): void {
  store.conteos.push(conteo);
  store.conteoVistos.set(key, conteo.id);
}

function espejarConteoSector(id: string, key: string, sector: string, diferencias: DiferenciaConteo[]): void {
  store.conteos.push({ id, sector, idemKey: key, creadoEn: new Date().toISOString(), diferencias });
  store.conteoVistos.set(key, id);
}

export type TipoMovimientoStock = "ALTA" | "VENTA" | "COMPENSATORIO";

export interface MovimientoStockNuevo {
  readonly idemKey: string;
  readonly sku: string;
  readonly loteId: string | null;
  readonly delta: number;
  readonly tipo: TipoMovimientoStock;
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
  if (store.stockMoves.some((m) => m.idemKey === idemKey && m.tipo === tipo)) return true;
  const db = dbVivaTenant();
  if (!db) return false;
  try {
    const filas = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.idemKey, idemKey))
      .limit(1);
    return Boolean(filas[0]);
  } catch (e) {
    propagarSiMulti(e);
    return false;
  }
}

// Escritura unica de movimientos: espejo memoria + stock_movements durable +
// products.stock_actual. En multi sin base propaga BaseNoDisponible.
export async function aplicarMovimiento(m: MovimientoStockNuevo): Promise<{ fuente: "db" | "memoria" }> {
  const registro: StoredStockMovement = { idemKey: m.idemKey, sku: m.sku, loteId: m.loteId, delta: m.delta, tipo: m.tipo };
  const db = dbVivaTenant();
  if (!db) {
    aplicarEnMemoria(registro);
    return { fuente: "memoria" };
  }
  try {
    await db.insert(stockMovements).values({
      idemKey: m.idemKey,
      sku: m.sku,
      loteId: m.loteId,
      delta: m.delta,
      tipo: m.tipo,
      ...(m.motivo !== undefined ? { motivo: m.motivo } : {}),
    });
    await db
      .update(products)
      .set({ stockActual: sql`${products.stockActual} + ${m.delta}` })
      .where(eq(products.sku, m.sku));
    aplicarEnMemoria(registro);
    return { fuente: "db" };
  } catch (e) {
    propagarSiMulti(e);
    aplicarEnMemoria(registro);
    return { fuente: "memoria" };
  }
}

function aplicarEnMemoria(m: StoredStockMovement): void {
  store.stock.set(m.sku, (store.stock.get(m.sku) ?? 0) + m.delta);
  store.stockMoves.push(m);
}

export function nivelStock(sku: string): number {
  return store.stock.get(sku) ?? 0;
}

export async function listarMovimientos(): Promise<StoredStockMovement[]> {
  const db = dbVivaTenant();
  if (!db) return [...store.stockMoves];
  try {
    const filas = await db.select().from(stockMovements);
    const union = new Map<string, StoredStockMovement>();
    for (const m of store.stockMoves) union.set(`${m.tipo}:${m.idemKey}:${m.sku}`, m);
    for (const f of filas) {
      union.set(`${f.tipo}:${f.idemKey}:${f.sku}`, {
        idemKey: f.idemKey,
        sku: f.sku,
        loteId: f.loteId,
        delta: f.delta,
        tipo: f.tipo as TipoMovimientoStock,
      });
    }
    return [...union.values()];
  } catch (e) {
    propagarSiMulti(e);
    return [...store.stockMoves];
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
  const dupMemoria = store.conteos.find((c) => c.idemKey === input.key);
  if (dupMemoria) return { ok: false, codigo: "DUPLICADO", error: "duplicado", original: dupMemoria };
  const diferencias = diferenciasDe(input.lineas);
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
      espejarCrearConteo({ id, sector: "general", idemKey: input.key, creadoEn: new Date().toISOString(), diferencias, estado: "en_curso" as const, contadoPor: input.contadoPor }, input.key);
      return { ok: true, id, diferencias };
    } catch (e) {
      if (esChoqueIdemKey(e)) {
        return { ok: false, codigo: "DUPLICADO", error: "duplicado", original: { idemKey: input.key } };
      }
      propagarSiMulti(e);
    }
  }
  const id = crypto.randomUUID();
  espejarCrearConteo({ id, sector: "general", idemKey: input.key, creadoEn: new Date().toISOString(), diferencias, estado: "en_curso" as const, contadoPor: input.contadoPor }, input.key);
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
  const enMemoria = store.conteos.find((x) => x.id === input.id);
  const db = dbVivaTenant();
  if (db) {
    try {
      const cab = await db.select().from(stockCounts).where(eq(stockCounts.id, input.id)).limit(1);
      const fila = cab[0];
      if (fila) {
        if (input.rol === "empleado") {
          await db.update(stockCounts).set({ estado: "listo_revisar" }).where(eq(stockCounts.id, input.id));
          if (enMemoria) enMemoria.estado = "listo_revisar";
          return { ok: true, id: input.id, estado: "listo_revisar" };
        }
        if (!input.motivo) return { ok: false, codigo: "MOTIVO_REQUERIDO", error: "confirmar exige motivo" };
        const lineas = await db.select().from(stockCountLines).where(eq(stockCountLines.countId, input.id));
        await db.update(stockCounts).set({ estado: "confirmado", confirmadoPor: input.confirmadoPor }).where(eq(stockCounts.id, input.id));
        // Por qué key por línea: la misma key para varias líneas chocaría en el dedup.
        for (const l of lineas) {
          const dif = l.fisico - l.teorico;
          if (dif !== 0) {
            await aplicarMovimiento({ idemKey: `conteo:${input.id}:${l.sku}`, sku: l.sku, loteId: null, delta: dif, tipo: "COMPENSATORIO", motivo: input.motivo });
          }
        }
        if (enMemoria) enMemoria.estado = "confirmado";
        return { ok: true, id: input.id, estado: "confirmado" };
      }
      if (!enMemoria) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    } catch (e) {
      propagarSiMulti(e);
    }
  }
  if (!enMemoria) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
  if (input.rol === "empleado") {
    enMemoria.estado = "listo_revisar";
    return { ok: true, id: input.id, estado: "listo_revisar" };
  }
  if (!input.motivo) return { ok: false, codigo: "MOTIVO_REQUERIDO", error: "confirmar exige motivo" };
  enMemoria.estado = "confirmado";
  for (const d of enMemoria.diferencias) {
    if (d.diferencia !== 0) {
      await aplicarMovimiento({ idemKey: `conteo:${input.id}:${d.sku}`, sku: d.sku, loteId: null, delta: d.diferencia, tipo: "COMPENSATORIO" });
    }
  }
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
  const visto = store.conteoVistos.get(input.key);
  if (visto !== undefined) return { ok: false, codigo: "DUPLICADO", conteoId: visto };
  const r = conteo_por_sector(
    input.motivo === undefined
      ? { teorico: store.stock, fisico: [...input.fisico], sectorDe: store.productSectores, sector: input.sector, idemKey: input.key }
      : { teorico: store.stock, fisico: [...input.fisico], sectorDe: store.productSectores, sector: input.sector, idemKey: input.key, motivo: input.motivo },
  );
  if (!r.ok) return { ok: false, codigo: r.codigo, error: r.codigo };
  const diferencias: DiferenciaConteo[] = r.valor.diferencias.map((d) => ({
    sku: d.sku as string,
    teorico: d.teorico,
    fisico: d.fisico,
    diferencia: d.diferencia,
  }));
  const db = dbVivaTenant();
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
        await aplicarMovimiento({ idemKey: m.idemKey, sku: m.sku as string, loteId: m.loteId as string | null, delta: m.delta, tipo: m.tipo as TipoMovimientoStock, ...(m.motivo ? { motivo: m.motivo } : {}) });
      }
      espejarConteoSector(id, input.key, r.valor.sector, diferencias);
      return { ok: true, conteoId: id, sector: r.valor.sector, diferencias: r.valor.diferencias, movimientos: r.valor.movimientos.length, unidadesAjuste: r.valor.unidadesAjuste };
    } catch (e) {
      if (esChoqueIdemKey(e)) {
        try {
          const rival = await db.select({ id: stockCounts.id }).from(stockCounts).where(eq(stockCounts.idemKey, input.key)).limit(1);
          return { ok: false, codigo: "DUPLICADO", conteoId: rival[0]?.id ?? "" };
        } catch {
          propagarSiMulti(e);
        }
      } else {
        propagarSiMulti(e);
      }
    }
  }
  for (const m of r.valor.movimientos) {
    await aplicarMovimiento({ idemKey: m.idemKey, sku: m.sku as string, loteId: m.loteId as string | null, delta: m.delta, tipo: m.tipo as TipoMovimientoStock, ...(m.motivo ? { motivo: m.motivo } : {}) });
  }
  const id = crypto.randomUUID();
  espejarConteoSector(id, input.key, r.valor.sector, diferencias);
  return { ok: true, conteoId: id, sector: r.valor.sector, diferencias: r.valor.diferencias, movimientos: r.valor.movimientos.length, unidadesAjuste: r.valor.unidadesAjuste };
}
