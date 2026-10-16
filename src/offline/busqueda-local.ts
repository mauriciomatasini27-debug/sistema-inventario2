import { coincideDifuso } from "../modules/inventario/busqueda.js";

// SYNC-S2 (PRD-SYNC-01): búsqueda difusa sobre el catálogo cacheado en el
// dispositivo. Núcleo puro: sin IO, sin red, sin store. Reusa el mismo
// criterio del mostrador (tildes, caja, prefijo de token, un typo chico).

export interface ItemCatalogoLocal {
  readonly sku: string;
  readonly nombre: string;
}

// Filtra el catálogo por sku/nombre y corta a los primeros `limite`.
export function buscarProductosLocal(
  catalogo: ReadonlyArray<ItemCatalogoLocal>,
  q: string,
  limite = 20,
): ItemCatalogoLocal[] {
  const top = Math.max(limite, 0);
  const hits = catalogo.filter((c) => coincideDifuso([c.sku, c.nombre], q));
  return hits.slice(0, top);
}
