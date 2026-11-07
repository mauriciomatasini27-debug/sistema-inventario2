// P1-59: el stock del mostrador es el último pull menos lo pendiente en la cola.
// Se calcula al leer para no escribir el snapshot, que solo actualiza el pull.

import type { SnapshotCatalogoLocal } from "./catalogo-local.js";
import type { ItemCola } from "./cola-venta.js";

function esRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function lineasLegibles(payload: unknown): readonly { product_id: string; qty: number }[] {
  if (!esRecord(payload)) return [];
  const crudas = payload["lineas"];
  if (!Array.isArray(crudas)) return [];
  const lineas: { product_id: string; qty: number }[] = [];
  for (const cruda of crudas) {
    if (!esRecord(cruda)) continue;
    const product_id = cruda["product_id"];
    const qty = cruda["qty"];
    if (typeof product_id !== "string" || product_id.length < 1) continue;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) continue;
    lineas.push({ product_id, qty });
  }
  return lineas;
}

function qtyPendiente(itemsCola: readonly ItemCola[], sku: string): number {
  const vistos = new Set<string>();
  let total = 0;
  for (const item of itemsCola) {
    if (vistos.has(item.op_id)) continue;
    vistos.add(item.op_id);
    for (const linea of lineasLegibles(item.payload)) {
      if (linea.product_id === sku) total += linea.qty;
    }
  }
  return total;
}

export function stockLocal(
  snapshot: SnapshotCatalogoLocal | null,
  itemsCola: readonly ItemCola[],
  sku: string,
  qtyEnCarrito = 0,
): number | null {
  if (snapshot === null || !Object.hasOwn(snapshot.productos, sku)) return null;
  const producto = snapshot.productos[sku];
  if (!producto) return null;
  const enCarrito = Number.isInteger(qtyEnCarrito) && qtyEnCarrito > 0 ? qtyEnCarrito : 0;
  return producto.stock - qtyPendiente(itemsCola, sku) - enCarrito;
}

export function avisoStockLocalAgotado(stock: number | null): boolean {
  return stock !== null && stock <= 0;
}
