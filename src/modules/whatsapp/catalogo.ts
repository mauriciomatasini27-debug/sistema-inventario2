// Fuente viva del catálogo para el Bot WA (B3-B10). Sin IO: el adaptador
// (ruta webhook o job) pasa los mapas del store del tenant y acá se arma el
// snapshot con la misma forma que la futura lectura Drizzle.
// Slice-0: un solo catálogo demo en memoria; prod lee products + precios.

import type { ItemVivo } from "./servicio.js";

// Nombres demo por SKU (mismo criterio que Slice-0: prod lee Drizzle del
// tenant; la forma del snapshot es la misma).
const NOMBRES_DEMO: Readonly<Record<string, { nombre: string; umbral: number; proveedor: string }>> = {
  "demo-sku-1": { nombre: "Alfajor Jorgito", umbral: 10, proveedor: "Golosinas Sur" },
};

export function catalogo_vivo(
  stock: ReadonlyMap<string, number>,
  prices: ReadonlyMap<string, number>,
): ItemVivo[] {
  return [...stock.entries()].map(([sku, qty]) => {
    const demo = NOMBRES_DEMO[sku];
    return {
      sku,
      nombre: demo?.nombre ?? sku,
      stock: qty,
      umbral: demo?.umbral ?? 0,
      precioCentavos: BigInt(prices.get(sku) ?? 0),
      proveedor: demo?.proveedor ?? null,
    };
  });
}
