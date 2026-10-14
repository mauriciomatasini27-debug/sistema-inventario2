import { stockLots } from "../../db/schema.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant } from "../server-db.js";
import { store } from "../store.js";

// PERS2-S19 (ADR-0059): lotes para el job de vencimientos. DB primero via
// dbVivaTenant(); solo en single sin base usa la memoria particionada. En
// multi sin base dbVivaTenant lanza BaseNoDisponible y se propaga (503).

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

export interface LoteVista {
  id: string;
  sku: string;
  cantidadRestante: number;
  venceEl: string | null;
}

// Lotes del tenant con DB viva (stock_lots), memoria particionada solo en
// single sin base. En multi sin base propaga BaseNoDisponible.
export async function listarLotes(): Promise<LoteVista[]> {
  const db = dbVivaTenant();
  if (!db) return [...store.lotes.values()].map((l) => ({ id: l.id, sku: l.sku, cantidadRestante: l.cantidadRestante, venceEl: l.venceEl }));
  try {
    const filas = await db.select().from(stockLots);
    return filas.map((f) => ({ id: f.id, sku: f.sku, cantidadRestante: f.cantidadRestante, venceEl: f.venceEl ? f.venceEl.toISOString() : null }));
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return [...store.lotes.values()].map((l) => ({ id: l.id, sku: l.sku, cantidadRestante: l.cantidadRestante, venceEl: l.venceEl }));
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
