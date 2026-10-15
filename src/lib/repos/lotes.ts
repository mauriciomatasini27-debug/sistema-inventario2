import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { stockLots } from "../../db/schema.js";
import { dbVivaTenant } from "../server-db.js";
import { crearAlmacenLotes, crearListaMovimientosStock } from "./_almacen.js";
import { aplicarMovimiento, movimientoDuplicado } from "./stock.js";

// PERS2-S19 (ADR-0059): lotes para el job de vencimientos. DB primero via
// dbVivaTenant(); solo en single sin base usa la memoria particionada. En
// multi sin base dbVivaTenant lanza BaseNoDisponible y se propaga (503).

export interface LoteVista {
  id: string;
  sku: string;
  cantidadRestante: number;
  venceEl: string | null;
}

// Lotes del tenant con DB viva (stock_lots), memoria particionada solo en
// single sin base. En multi sin base propaga BaseNoDisponible.
export async function listarLotes(): Promise<LoteVista[]> {
  const almacenLotes = crearAlmacenLotes();
  const db = dbVivaTenant();
  if (!db) return [...almacenLotes.comoMapaSoloLectura().values()].map((l) => ({ id: l.id, sku: l.sku, cantidadRestante: l.cantidadRestante, venceEl: l.venceEl }));
  try {
    const filas = await db.select().from(stockLots);
    return filas.map((f) => ({ id: f.id, sku: f.sku, cantidadRestante: f.cantidadRestante, venceEl: f.venceEl ? f.venceEl.toISOString() : null }));
  } catch (e) {
    almacenLotes.anteFalloPersistencia(e);
    return [...almacenLotes.comoMapaSoloLectura().values()].map((l) => ({ id: l.id, sku: l.sku, cantidadRestante: l.cantidadRestante, venceEl: l.venceEl }));
  }
}

export interface AlertaLote {
  lote_id: string;
  sku: string;
  vence_el: string;
  dias: number;
  cantidad_restante: number;
}

export interface ClasificacionLotes {
  alertas_15d: AlertaLote[];
  alertas_7d: AlertaLote[];
  alertas_3d: AlertaLote[];
  vencidos: Array<AlertaLote & { accion: "baja_merma" }>;
  promo_bot: boolean;
}

// Clasificación CAT-S4 (15/7/3 días + vencidos), pura como la ruta actual.
export function clasificarLotes(lotes: ReadonlyArray<LoteVista>, ahoraMs: number): ClasificacionLotes {
  const alertas15: AlertaLote[] = [];
  const alertas7: AlertaLote[] = [];
  const alertas3: AlertaLote[] = [];
  const vencidos: Array<AlertaLote & { accion: "baja_merma" }> = [];
  for (const l of lotes) {
    if (!l.venceEl) continue;
    const dias = Math.ceil((new Date(l.venceEl).getTime() - ahoraMs) / 86400_000);
    const item = { lote_id: l.id, sku: l.sku, vence_el: l.venceEl, dias, cantidad_restante: l.cantidadRestante };
    if (dias < 0) vencidos.push({ ...item, accion: "baja_merma" });
    else if (dias <= 3) alertas3.push(item);
    else if (dias <= 7) alertas7.push(item);
    else if (dias <= 15) alertas15.push(item);
  }
  return { alertas_15d: alertas15, alertas_7d: alertas7, alertas_3d: alertas3, vencidos, promo_bot: alertas3.length > 0 };
}

export interface LoteDetalle {
  id: string;
  sku: string;
  cantidad: number;
  cantidadRestante: number;
  venceEl: string | null;
  costoCentavos: string;
}

// Lista CAT-S3 ordenada FEFO (vence_el ASC, nulls last): union del espejo en
// memoria y stock_lots con DB viva; memoria solo en single sin base.
export async function listarLotesDetalle(sku: string | null): Promise<LoteDetalle[]> {
  const almacenLotes = crearAlmacenLotes();
  const db = dbVivaTenant();
  if (!db) return ordenarFefo(filtrarLotes(sku));
  try {
    const filas = await db.select().from(stockLots);
    const union = new Map<string, LoteDetalle>();
    for (const l of almacenLotes.comoMapaSoloLectura().values()) {
      union.set(l.id, { id: l.id, sku: l.sku, cantidad: l.cantidad, cantidadRestante: l.cantidadRestante, venceEl: l.venceEl, costoCentavos: l.costoCentavos });
    }
    for (const f of filas) {
      if (!union.has(f.id)) {
        union.set(f.id, {
          id: f.id,
          sku: f.sku,
          cantidad: f.cantidad,
          cantidadRestante: f.cantidadRestante,
          venceEl: f.venceEl ? f.venceEl.toISOString() : null,
          costoCentavos: f.costoCentavos.toString(),
        });
      }
    }
    return ordenarFefo(sku ? [...union.values()].filter((l) => l.sku === sku) : [...union.values()]);
  } catch (e) {
    almacenLotes.anteFalloPersistencia(e);
    return ordenarFefo(filtrarLotes(sku));
  }
}

function filtrarLotes(sku: string | null): LoteDetalle[] {
  let lista = [...crearAlmacenLotes().comoMapaSoloLectura().values()];
  if (sku) lista = lista.filter((l) => l.sku === sku);
  return ordenarFefo(lista.map((l) => ({ id: l.id, sku: l.sku, cantidad: l.cantidad, cantidadRestante: l.cantidadRestante, venceEl: l.venceEl, costoCentavos: l.costoCentavos })));
}

function ordenarFefo(lista: LoteDetalle[]): LoteDetalle[] {
  return [...lista].sort((a, b) => {
    if (!a.venceEl && !b.venceEl) return a.id < b.id ? -1 : 1;
    if (!a.venceEl) return 1;
    if (!b.venceEl) return -1;
    return a.venceEl < b.venceEl ? -1 : 1;
  });
}

export interface CrearLoteInput {
  readonly sku: string;
  readonly cantidad: number;
  readonly venceEl: string | null;
  readonly costoCentavos: number;
  readonly controlaVencimiento: boolean;
  readonly idemKey: string;
}

export type CrearLoteResultado =
  | { ok: true; lote: LoteDetalle; fuente: "db" | "memoria" }
  | { ok: false; codigo: "SIN_VENCIMIENTO"; error: string }
  | { ok: false; codigo: "DUPLICADO"; error: string; original: unknown };

// Ingreso CAT-S3 con FEFO auto: el lote va a stock_lots y el movimiento ALTA
// solo por stock.ts. En multi sin base propaga BaseNoDisponible.
export async function crearLote(input: CrearLoteInput): Promise<CrearLoteResultado> {
  if (input.controlaVencimiento && !input.venceEl) {
    return { ok: false, codigo: "SIN_VENCIMIENTO", error: "controla_vencimiento exige vence_el" };
  }
  if (await movimientoDuplicado(input.idemKey, "ALTA")) {
    const original = crearListaMovimientosStock().listar().find((m) => m.idemKey === input.idemKey && m.tipo === "ALTA") ?? null;
    return { ok: false, codigo: "DUPLICADO", error: "duplicado", original };
  }
  const almacenLotes = crearAlmacenLotes();
  const id = randomUUID();
  const lote: LoteDetalle = {
    id,
    sku: input.sku,
    cantidad: input.cantidad,
    cantidadRestante: input.cantidad,
    venceEl: input.venceEl,
    costoCentavos: String(input.costoCentavos),
  };
  const db = dbVivaTenant();
  if (!db) {
    almacenLotes.guardar(id, { ...lote });
    const r = await aplicarMovimiento({ idemKey: input.idemKey, sku: input.sku, loteId: id, delta: input.cantidad, tipo: "ALTA" });
    return { ok: true, lote, fuente: r.fuente };
  }
  try {
    await db.insert(stockLots).values({
      sku: input.sku,
      cantidad: input.cantidad,
      cantidadRestante: input.cantidad,
      venceEl: input.venceEl ? new Date(input.venceEl) : null,
      costoCentavos: BigInt(input.costoCentavos),
    }).onConflictDoNothing();
    almacenLotes.guardar(id, { ...lote });
    const r = await aplicarMovimiento({ idemKey: input.idemKey, sku: input.sku, loteId: id, delta: input.cantidad, tipo: "ALTA" });
    return { ok: true, lote, fuente: "db" };
  } catch (e) {
    almacenLotes.anteFalloPersistencia(e);
    almacenLotes.guardar(id, { ...lote });
    const r = await aplicarMovimiento({ idemKey: input.idemKey, sku: input.sku, loteId: id, delta: input.cantidad, tipo: "ALTA" });
    return { ok: true, lote, fuente: r.fuente };
  }
}
