import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { stockLots } from "../../db/schema.js";
import { dbVivaTenant } from "../server-db.js";
import { costoUnitarioPorSku } from "../../modules/inventario/inventario.js";
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

export interface PromoVencer {
  sku: string;
  lote_id: string;
  vence_en_dias: number;
}

export interface ClasificacionLotes {
  alertas_15d: AlertaLote[];
  alertas_7d: AlertaLote[];
  alertas_3d: AlertaLote[];
  vencidos: Array<AlertaLote & { accion: "baja_merma" }>;
  promo_bot: boolean;
  promos_vencer: PromoVencer[];
}

// Clasificación CAT-S4 (15/7/3 días + vencidos), pura como la ruta actual.
// Un vencido con restante <= 0 ya fue dado de baja: no se reporta de nuevo
// (la idempotencia del job se apoya en esto más el idemKey merma:vencido:).
export function clasificarLotes(lotes: ReadonlyArray<LoteVista>, ahoraMs: number): ClasificacionLotes {
  const alertas15: AlertaLote[] = [];
  const alertas7: AlertaLote[] = [];
  const alertas3: AlertaLote[] = [];
  const vencidos: Array<AlertaLote & { accion: "baja_merma" }> = [];
  for (const l of lotes) {
    if (!l.venceEl) continue;
    const dias = Math.ceil((new Date(l.venceEl).getTime() - ahoraMs) / 86400_000);
    const item = { lote_id: l.id, sku: l.sku, vence_el: l.venceEl, dias, cantidad_restante: l.cantidadRestante };
    if (dias < 0) {
      if (l.cantidadRestante > 0) vencidos.push({ ...item, accion: "baja_merma" });
    } else if (dias <= 3) alertas3.push(item);
    else if (dias <= 7) alertas7.push(item);
    else if (dias <= 15) alertas15.push(item);
  }
  const promos_vencer: PromoVencer[] = alertas3.map((a) => ({ sku: a.sku, lote_id: a.lote_id, vence_en_dias: a.dias }));
  return { alertas_15d: alertas15, alertas_7d: alertas7, alertas_3d: alertas3, vencidos, promo_bot: alertas3.length > 0, promos_vencer };
}

export interface BajaMerma {
  lote_id: string;
  sku: string;
  cantidad: number;
}

// Baja CAT-S4: cada vencido con restante > 0 genera UN movimiento MERMA
// (delta -restante, motivo "vencido", idemKey merma:vencido:<lote_id>) y pone
// el restante en 0 en memoria y en stock_lots con DB viva. Idempotente: la
// segunda corrida no aplica ni reporta nada (duplicado o restante ya en 0).
// Devuelve solo lo dado de baja en ESTA corrida.
export async function darDeBajaVencidos(vencidos: ReadonlyArray<{ lote_id: string; sku: string; cantidad_restante: number }>): Promise<BajaMerma[]> {
  const bajas: BajaMerma[] = [];
  const almacenLotes = crearAlmacenLotes();
  const db = dbVivaTenant();
  for (const v of vencidos) {
    if (v.cantidad_restante <= 0) continue;
    const idemKey = `merma:vencido:${v.lote_id}`;
    const actual = almacenLotes.obtener(v.lote_id)?.cantidadRestante ?? v.cantidad_restante;
    if (actual <= 0 || (await movimientoDuplicado(idemKey, "MERMA"))) {
      await ponerLoteEnCero(v.lote_id, almacenLotes, db);
      continue;
    }
    await aplicarMovimiento({ idemKey, sku: v.sku, loteId: v.lote_id, delta: -actual, tipo: "MERMA", motivo: "vencido" });
    await ponerLoteEnCero(v.lote_id, almacenLotes, db);
    bajas.push({ lote_id: v.lote_id, sku: v.sku, cantidad: actual });
  }
  return bajas;
}

async function ponerLoteEnCero(
  loteId: string,
  almacenLotes: ReturnType<typeof crearAlmacenLotes>,
  db: ReturnType<typeof dbVivaTenant>,
): Promise<void> {
  const lote = almacenLotes.obtener(loteId);
  if (lote) almacenLotes.guardar(loteId, { ...lote, cantidadRestante: 0 });
  if (!db) return;
  try {
    await db.update(stockLots).set({ cantidadRestante: 0 }).where(eq(stockLots.id, loteId));
  } catch (e) {
    almacenLotes.anteFalloPersistencia(e);
  }
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

// P10-16 GP4: costo unitario vigente por SKU (promedio ponderado por cantidad
// restante) para congelarlo en la línea de venta.
export async function costosVigentesPorSku(): Promise<Map<string, bigint>> {
  const lotes = await listarLotesDetalle(null);
  return costoUnitarioPorSku(
    lotes.map((l) => ({ sku: l.sku, cantidad: l.cantidadRestante, costoCentavos: BigInt(l.costoCentavos) })),
  );
}

export function costosVigentesMemoria(): Map<string, bigint> {
  const lotes = [...crearAlmacenLotes().comoMapaSoloLectura().values()];
  return costoUnitarioPorSku(
    lotes.map((l) => ({ sku: l.sku, cantidad: l.cantidadRestante, costoCentavos: BigInt(l.costoCentavos) })),
  );
}

// Invariante CAT-S3, pura: stock = suma de restantes de lotes = suma de
// deltas de movimientos. Sin IO.
export function invarianteStockLotesMovs(args: { stockActual: number; lotesCantidadRestante: number; movsDeltaSum: number }): boolean {
  return args.stockActual === args.lotesCantidadRestante && args.lotesCantidadRestante === args.movsDeltaSum;
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
    // CAT-S4: el insert lleva el id generado para que la fila DB y el espejo
    // en memoria compartan id (el UPDATE de baja por id acierta).
    await db.insert(stockLots).values({
      id,
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
