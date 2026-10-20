export const CLAVE_CATALOGO = "offline:catalogo";
export const VERSION_CATALOGO = 1 as const;
export const MAX_EDAD_CATALOGO_MS = 15 * 60_000;
export const URL_CATALOGO = "/api/sync/pull?cursor=0&limite=1";

export interface ProductoCatalogoLocal {
  stock: number;
  precioCentavos: number;
}

export interface SnapshotCatalogoLocal {
  version: typeof VERSION_CATALOGO;
  descargadoEl: string;
  productos: Record<string, ProductoCatalogoLocal>;
}

export interface StorageCatalogo {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export interface RespuestaCatalogo {
  ok: boolean;
  status: number;
  // Por qué: sin red el SW devuelve el último pull cacheado (`x-desde-cache: 1`);
  // tomarlo como descarga nueva le pondría hora de ahora a un catálogo viejo.
  desdeCache?: boolean;
  json(): Promise<unknown>;
}

export interface DepsDescargarCatalogo {
  fetch(url: string): Promise<RespuestaCatalogo>;
  storage: StorageCatalogo;
  ahora?: () => Date;
}

export type MotivoFalloCatalogo = "sin_red" | "desde_cache" | "respuesta_invalida" | `http_${number}`;

export type ResultadoDescargaCatalogo =
  | { ok: true; snapshot: SnapshotCatalogoLocal }
  | { ok: false; motivo: MotivoFalloCatalogo };

const CLAVES_PELIGROSAS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

function esRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function esEnteroNoNegativo(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function productosDesdeCatalogo(catalogo: unknown): Record<string, ProductoCatalogoLocal> | null {
  if (!esRecord(catalogo)) return null;
  const stock = catalogo["stock"];
  const prices = catalogo["prices"];
  if (!esRecord(stock) || !esRecord(prices)) return null;

  const productos: Record<string, ProductoCatalogoLocal> = {};
  for (const [sku, valorStock] of Object.entries(stock)) {
    if (sku.trim() === "" || CLAVES_PELIGROSAS.has(sku)) continue;
    if (!esEnteroNoNegativo(valorStock)) continue;
    const precio = prices[sku];
    if (!esEnteroNoNegativo(precio)) continue;
    productos[sku] = { stock: valorStock, precioCentavos: precio };
  }
  return productos;
}

function snapshotDesdeValor(valor: unknown): SnapshotCatalogoLocal | null {
  if (!esRecord(valor)) return null;
  if (valor["version"] !== VERSION_CATALOGO) return null;
  const descargadoEl = valor["descargadoEl"];
  if (typeof descargadoEl !== "string" || Number.isNaN(Date.parse(descargadoEl))) return null;
  const crudos = valor["productos"];
  if (!esRecord(crudos)) return null;

  const productos: Record<string, ProductoCatalogoLocal> = {};
  for (const [sku, producto] of Object.entries(crudos)) {
    if (sku.trim() === "" || CLAVES_PELIGROSAS.has(sku)) return null;
    if (!esRecord(producto)) return null;
    const stock = producto["stock"];
    const precio = producto["precioCentavos"];
    if (!esEnteroNoNegativo(stock) || !esEnteroNoNegativo(precio)) return null;
    productos[sku] = { stock, precioCentavos: precio };
  }
  return { version: VERSION_CATALOGO, descargadoEl, productos };
}

/**
 * Descarga el catálogo del tenant y guarda el snapshot. Nunca lanza y no pisa
 * el último snapshot bueno cuando la red o la respuesta fallan.
 */
export async function descargarCatalogo(deps: DepsDescargarCatalogo): Promise<ResultadoDescargaCatalogo> {
  let res: RespuestaCatalogo;
  try {
    res = await deps.fetch(URL_CATALOGO);
  } catch (error) {
    console.warn("[catalogo-local] sin red", error);
    return { ok: false, motivo: "sin_red" };
  }

  if (res.desdeCache) return { ok: false, motivo: "desde_cache" };

  if (!res.ok) {
    console.warn("[catalogo-local] respuesta no exitosa", res.status);
    return { ok: false, motivo: `http_${res.status}` };
  }

  let cuerpo: unknown;
  try {
    cuerpo = await res.json();
  } catch (error) {
    console.warn("[catalogo-local] JSON inválido", error);
    return { ok: false, motivo: "respuesta_invalida" };
  }

  const productos = productosDesdeCatalogo(esRecord(cuerpo) ? cuerpo["catalogo"] : undefined);
  if (!productos) {
    console.warn("[catalogo-local] forma de catálogo inválida");
    return { ok: false, motivo: "respuesta_invalida" };
  }

  const fecha = deps.ahora ? deps.ahora() : new Date();
  const snapshot: SnapshotCatalogoLocal = {
    version: VERSION_CATALOGO,
    descargadoEl: fecha.toISOString(),
    productos,
  };
  try {
    deps.storage.setItem(CLAVE_CATALOGO, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("[catalogo-local] no se pudo guardar el snapshot", error);
    return { ok: false, motivo: "respuesta_invalida" };
  }
  return { ok: true, snapshot };
}

export function leerCatalogoLocal(storage: StorageCatalogo): SnapshotCatalogoLocal | null {
  try {
    const crudo = storage.getItem(CLAVE_CATALOGO);
    if (!crudo) return null;
    return snapshotDesdeValor(JSON.parse(crudo));
  } catch (error) {
    console.warn("[catalogo-local] snapshot ilegible", error);
    return null;
  }
}

export function precioLocal(snapshot: SnapshotCatalogoLocal | null, sku: string): number | null {
  if (!snapshot || !Object.hasOwn(snapshot.productos, sku)) return null;
  const producto = snapshot.productos[sku];
  return producto ? producto.precioCentavos : null;
}

export function debeDescargar(snapshot: SnapshotCatalogoLocal | null, ahora: Date, online: boolean): boolean {
  if (!online) return false;
  if (!snapshot) return true;
  const descargadoMs = Date.parse(snapshot.descargadoEl);
  if (Number.isNaN(descargadoMs)) return true;
  return ahora.getTime() - descargadoMs >= MAX_EDAD_CATALOGO_MS;
}

export function almacenamientoLocal(): StorageCatalogo | null {
  try {
    return (globalThis as { localStorage?: StorageCatalogo }).localStorage ?? null;
  } catch (error) {
    console.warn("[catalogo-local] sin localStorage", error);
    return null;
  }
}

export function borrarCatalogoLocal(storage: StorageCatalogo | null): void {
  if (!storage) return;
  try {
    storage.removeItem(CLAVE_CATALOGO);
  } catch (error) {
    console.warn("[catalogo-local] no se pudo borrar el snapshot", error);
  }
}
