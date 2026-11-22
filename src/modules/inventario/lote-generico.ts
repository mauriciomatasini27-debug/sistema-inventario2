import type { Lote, LotId, Sku } from "./inventario.js";

export function idLoteGenerico(sku: string): string {
  const texto = `lote-generico:${sku.trim().toUpperCase()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x9e3779b9;
  let h4 = 0x85ebca6b;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ c, 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ c, 0x27d4eb2f) >>> 0;
  }
  const hex = [h1, h2, h3, h4].map((n) => n.toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function lotesDesdeStockGenerico(stock: ReadonlyMap<string, number>): Lote[] {
  const out: Lote[] = [];
  for (const [sku, cantidad] of stock) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) continue;
    out.push({ id: idLoteGenerico(sku) as LotId, sku: sku as Sku, cantidad, venceEl: null, costoCentavos: 0n });
  }
  return out;
}
