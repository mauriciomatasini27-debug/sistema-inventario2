import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { products, stockMovements } from "../../db/schema.js";
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

export type TipoMovimientoStock = "ALTA" | "VENTA" | "COMPENSATORIO";

export interface MovimientoStockNuevo {
  readonly idemKey: string;
  readonly sku: string;
  readonly loteId: string | null;
  readonly delta: number;
  readonly tipo: TipoMovimientoStock;
  readonly motivo?: string | undefined;
}

// conteos: siguen en memoria como antes (pendiente pasar a stock_counts/stock_count_lines); los conteos y sus vistos viven en memoria del repo.
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
    if (esModoMulti()) throw aBaseNoDisponible(e);
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
    if (esModoMulti()) throw aBaseNoDisponible(e);
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
    if (esModoMulti()) throw aBaseNoDisponible(e);
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

// conteos: siguen en memoria como antes (pendiente pasar a stock_counts/stock_count_lines); el conteo vive en memoria del repo (ver arriba).
export async function crearConteo(input: CrearConteoInput): Promise<CrearConteoResultado> {
  void dbVivaTenant();
  const dup = store.conteos.find((c) => c.idemKey === input.key);
  if (dup) return { ok: false, codigo: "DUPLICADO", error: "duplicado", original: dup };
  const id = crypto.randomUUID();
  const diferencias = input.lineas.map((l) => {
    const sku = l.sku.trim().toUpperCase();
    const teorico = store.stock.get(sku) ?? 0;
    return { sku, teorico, fisico: l.fisico, diferencia: l.fisico - teorico };
  });
  const conteo = { id, sector: "general", idemKey: input.key, creadoEn: new Date().toISOString(), diferencias, estado: "en_curso" as const, contadoPor: input.contadoPor };
  store.conteos.push(conteo);
  store.conteoVistos.set(input.key, id);
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

// conteos: siguen en memoria como antes (pendiente pasar a stock_counts/stock_count_lines); el conteo vive en memoria del repo (ver arriba).
export async function confirmarConteo(input: ConfirmarConteoInput): Promise<ConfirmarConteoResultado> {
  void dbVivaTenant();
  const c = store.conteos.find((x) => x.id === input.id);
  if (!c) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
  if (input.rol === "empleado") {
    c.estado = "listo_revisar";
    return { ok: true, id: input.id, estado: "listo_revisar" };
  }
  if (!input.motivo) return { ok: false, codigo: "MOTIVO_REQUERIDO", error: "confirmar exige motivo" };
  c.estado = "confirmado";
  for (const d of c.diferencias) {
    if (d.diferencia !== 0) {
      await aplicarMovimiento({ idemKey: `conteo:${input.id}`, sku: d.sku, loteId: null, delta: d.diferencia, tipo: "COMPENSATORIO" });
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

// conteos: siguen en memoria como antes (pendiente pasar a stock_counts/stock_count_lines); el conteo vive en memoria del repo (ver arriba).
export async function conteoPorSector(input: ConteoSectorInput): Promise<ConteoSectorResultado> {
  void dbVivaTenant();
  if (store.conteoVistos.has(input.key)) {
    return { ok: false, codigo: "DUPLICADO", conteoId: store.conteoVistos.get(input.key) ?? "" };
  }
  const r = conteo_por_sector(
    input.motivo === undefined
      ? { teorico: store.stock, fisico: [...input.fisico], sectorDe: store.productSectores, sector: input.sector, idemKey: input.key }
      : { teorico: store.stock, fisico: [...input.fisico], sectorDe: store.productSectores, sector: input.sector, idemKey: input.key, motivo: input.motivo },
  );
  if (!r.ok) return { ok: false, codigo: r.codigo, error: r.codigo };
  for (const m of r.valor.movimientos) {
    await aplicarMovimiento({ idemKey: m.idemKey, sku: m.sku as string, loteId: m.loteId as string | null, delta: m.delta, tipo: m.tipo as TipoMovimientoStock, ...(m.motivo ? { motivo: m.motivo } : {}) });
  }
  const id = `conteo-${store.conteos.length + 1}`;
  const creadoEn = new Date().toISOString();
  const registrado: ConteoRegistrado = {
    id,
    sector: r.valor.sector,
    idemKey: input.key,
    creadoEn,
    diferencias: r.valor.diferencias.map((d) => ({
      sku: d.sku as string,
      teorico: d.teorico,
      fisico: d.fisico,
      diferencia: d.diferencia,
    })),
  };
  store.conteos.push(registrado);
  store.conteoVistos.set(input.key, id);
  return { ok: true, conteoId: id, sector: r.valor.sector, diferencias: r.valor.diferencias, movimientos: r.valor.movimientos.length, unidadesAjuste: r.valor.unidadesAjuste };
}
