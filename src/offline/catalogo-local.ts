// P10-13: el catálogo local es por tenant. `offline:catalogo:<tenantId>` aísla
// el snapshot entre comercios del mismo navegador; la clave global legada
// `offline:catalogo` se descarta al arrancar con tenant conocido, sin migrarla.
export const CLAVE_CATALOGO = "offline:catalogo";
export const PREFIJO_CLAVE_CATALOGO = "offline:catalogo:";
// P1-58: solo la versión 2 se lee. Trae el mapa código→SKU. Una versión anterior queda ausente hasta la próxima descarga con red.
export const VERSION_CATALOGO = 2 as const;
export const MAX_EDAD_CATALOGO_MS = 15 * 60_000;
export const URL_CATALOGO = "/api/sync/pull?cursor=0&limite=1";

export interface ProductoCatalogoLocal {
  stock: number;
  precioCentavos: number;
  porPeso?: boolean | undefined;
}

export interface SnapshotCatalogoLocal {
  version: typeof VERSION_CATALOGO;
  descargadoEl: string;
  productos: Record<string, ProductoCatalogoLocal>;
  // P1-58: el código vive aparte del producto para reemplazar el mapa entero en cada pull.
  codigos: Record<string, string>;
}

export interface StorageCatalogo {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
  // Para el wipe: enumerar las claves `offline:catalogo:*`. Opcional para no
  // romper storages mínimos (tests, mocks).
  keys?(): string[];
}

/** Clave del snapshot del tenant. Sin tenant conocido no hay clave. */
export function claveCatalogo(tenantId: string | null | undefined): string | null {
  const t = typeof tenantId === "string" ? tenantId.trim() : "";
  return t === "" ? null : PREFIJO_CLAVE_CATALOGO + t;
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
  tenantId: string | null;
  fetch(url: string): Promise<RespuestaCatalogo>;
  storage: StorageCatalogo;
  ahora?: () => Date;
}

export type MotivoFalloCatalogo = "sin_tenant" | "sin_red" | "desde_cache" | "respuesta_invalida" | `http_${number}`;

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

function porPesoDesdePull(catalogo: Record<string, unknown>): Record<string, boolean> | null {
  if (!Object.hasOwn(catalogo, "por_peso")) return {};
  const crudo = catalogo["por_peso"];
  if (!esRecord(crudo)) return null;
  const porPeso: Record<string, boolean> = {};
  for (const [sku, valor] of Object.entries(crudo)) {
    if (sku.trim() === "" || CLAVES_PELIGROSAS.has(sku)) continue;
    if (typeof valor !== "boolean") continue;
    porPeso[sku] = valor;
  }
  return porPeso;
}

function productosDesdeCatalogo(catalogo: unknown): Record<string, ProductoCatalogoLocal> | null {
  if (!esRecord(catalogo)) return null;
  const stock = catalogo["stock"];
  const prices = catalogo["prices"];
  if (!esRecord(stock) || !esRecord(prices)) return null;
  const porPeso = porPesoDesdePull(catalogo);
  if (!porPeso) return null;

  const productos: Record<string, ProductoCatalogoLocal> = {};
  for (const [sku, valorStock] of Object.entries(stock)) {
    if (sku.trim() === "" || CLAVES_PELIGROSAS.has(sku)) continue;
    if (!esEnteroNoNegativo(valorStock)) continue;
    const precio = prices[sku];
    if (!esEnteroNoNegativo(precio)) continue;
    const flag = porPeso[sku];
    productos[sku] = {
      stock: valorStock,
      precioCentavos: precio,
      ...(typeof flag === "boolean" ? { porPeso: flag } : {}),
    };
  }
  return productos;
}

function codigosLimpios(
  crudo: Record<string, unknown>,
  productos: Record<string, ProductoCatalogoLocal>,
): Record<string, string> {
  const codigos: Record<string, string> = {};
  for (const [clave, sku] of Object.entries(crudo)) {
    const codigo = clave.trim().toUpperCase();
    if (codigo === "" || CLAVES_PELIGROSAS.has(clave) || CLAVES_PELIGROSAS.has(codigo)) continue;
    if (typeof sku !== "string") continue;
    const destino = sku.trim();
    if (destino === "" || !Object.hasOwn(productos, destino)) continue;
    if (Object.hasOwn(codigos, codigo)) continue;
    codigos[codigo] = destino;
  }
  return codigos;
}

// P1-58: sin `codes` el pull viejo sigue siendo válido. Si `codes` viene y no es
// un objeto, no se pisa un snapshot que sí tenía EAN.
function codigosDesdePull(
  catalogo: Record<string, unknown>,
  productos: Record<string, ProductoCatalogoLocal>,
): Record<string, string> | null {
  if (!Object.hasOwn(catalogo, "codes")) return {};
  const codes = catalogo["codes"];
  if (!esRecord(codes)) return null;
  return codigosLimpios(codes, productos);
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
    const porPeso = producto["porPeso"];
    productos[sku] = {
      stock,
      precioCentavos: precio,
      ...(typeof porPeso === "boolean" ? { porPeso } : {}),
    };
  }
  const crudosCodigos = valor["codigos"];
  if (!esRecord(crudosCodigos)) return null;
  const codigos = codigosLimpios(crudosCodigos, productos);
  return { version: VERSION_CATALOGO, descargadoEl, productos, codigos };
}

/**
 * Descarga el catálogo del tenant y guarda el snapshot. Nunca lanza y no pisa
 * el último snapshot bueno cuando la red o la respuesta fallan.
 */
export async function descargarCatalogo(deps: DepsDescargarCatalogo): Promise<ResultadoDescargaCatalogo> {
  const clave = claveCatalogo(deps.tenantId);
  if (!clave) return { ok: false, motivo: "sin_tenant" };
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

  const catalogo = esRecord(cuerpo) ? cuerpo["catalogo"] : undefined;
  if (!esRecord(catalogo)) {
    console.warn("[catalogo-local] forma de catálogo inválida");
    return { ok: false, motivo: "respuesta_invalida" };
  }
  const productos = productosDesdeCatalogo(catalogo);
  const codigos = productos ? codigosDesdePull(catalogo, productos) : null;
  if (!productos || !codigos) {
    console.warn("[catalogo-local] forma de catálogo inválida");
    return { ok: false, motivo: "respuesta_invalida" };
  }

  const fecha = deps.ahora ? deps.ahora() : new Date();
  const snapshot: SnapshotCatalogoLocal = {
    version: VERSION_CATALOGO,
    descargadoEl: fecha.toISOString(),
    productos,
    codigos,
  };
  try {
    deps.storage.setItem(clave, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("[catalogo-local] no se pudo guardar el snapshot", error);
    return { ok: false, motivo: "respuesta_invalida" };
  }
  return { ok: true, snapshot };
}

// STOCK-S1 (ADR-0106): el alta al vender sin red suma el SKU al snapshot local
// para que la próxima venta autocomplete precio. First-writer-wins por SKU: un
// SKU existente no se pisa. El epoch es a propósito: el alta no es una descarga
// y debeDescargar tiene que seguir pidiendo el pull para reconciliar.
const EPOCH_CATALOGO = "1970-01-01T00:00:00.000Z";

function snapshotVacio(): SnapshotCatalogoLocal {
  return { version: VERSION_CATALOGO, descargadoEl: EPOCH_CATALOGO, productos: {}, codigos: {} };
}

export function agregarProvisorio(
  storage: StorageCatalogo,
  tenantId: string | null,
  sku: string,
  precioCentavos: number,
): SnapshotCatalogoLocal {
  const clave = claveCatalogo(tenantId);
  if (!clave) return snapshotVacio();
  const previo = leerCatalogoLocal(storage, tenantId) ?? snapshotVacio();
  if (sku.trim() === "" || CLAVES_PELIGROSAS.has(sku)) return previo;
  if (Object.hasOwn(previo.productos, sku)) return previo;
  if (!esEnteroNoNegativo(precioCentavos)) return previo;

  // P1-58: el alta no inventa un EAN. El mapa queda como estaba.
  const snapshot: SnapshotCatalogoLocal = {
    version: VERSION_CATALOGO,
    descargadoEl: previo.descargadoEl,
    productos: { ...previo.productos, [sku]: { stock: 0, precioCentavos } },
    codigos: { ...previo.codigos },
  };
  try {
    storage.setItem(clave, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("[catalogo-local] no se pudo guardar el provisorio", error);
  }
  return snapshot;
}

export function leerCatalogoLocal(storage: StorageCatalogo, tenantId: string | null): SnapshotCatalogoLocal | null {
  const clave = claveCatalogo(tenantId);
  if (!clave) return null;
  try {
    const crudo = storage.getItem(clave);
    if (!crudo) return null;
    return snapshotDesdeValor(JSON.parse(crudo));
  } catch (error) {
    console.warn("[catalogo-local] snapshot ilegible", error);
    return null;
  }
}

export function esPorPesoLocal(snapshot: SnapshotCatalogoLocal | null, sku: string): boolean {
  if (!snapshot || !Object.hasOwn(snapshot.productos, sku)) return false;
  return snapshot.productos[sku]?.porPeso === true;
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
    const ls = (globalThis as { localStorage?: Storage }).localStorage ?? null;
    if (!ls) return null;
    return {
      getItem: (clave) => ls.getItem(clave),
      setItem: (clave, valor) => {
        ls.setItem(clave, valor);
      },
      removeItem: (clave) => {
        ls.removeItem(clave);
      },
      keys: () => {
        const out: string[] = [];
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k !== null) out.push(k);
        }
        return out;
      },
    };
  } catch (error) {
    console.warn("[catalogo-local] sin localStorage", error);
    return null;
  }
}

/** Borra el snapshot del tenant. Sin tenant no toca nada. */
export function borrarCatalogoLocal(storage: StorageCatalogo | null, tenantId: string | null): void {
  const clave = claveCatalogo(tenantId);
  if (!storage || !clave) return;
  try {
    storage.removeItem(clave);
  } catch (error) {
    console.warn("[catalogo-local] no se pudo borrar el snapshot", error);
  }
}

function clavesCatalogo(storage: StorageCatalogo): string[] {
  if (typeof storage.keys !== "function") return [];
  let claves: string[];
  try {
    claves = storage.keys();
  } catch (error) {
    console.warn("[catalogo-local] no se pudieron enumerar las claves", error);
    return [];
  }
  if (!Array.isArray(claves)) return [];
  return claves.filter((k) => typeof k === "string" && k.startsWith(PREFIJO_CLAVE_CATALOGO));
}

/**
 * Borrado remoto: borra la clave legada global y todas las `offline:catalogo:*`
 * de cualquier tenant. Es la garantía de "sin base legible" al revocar.
 */
export function borrarCatalogosLocales(storage: StorageCatalogo | null): void {
  if (!storage) return;
  try {
    storage.removeItem(CLAVE_CATALOGO);
  } catch (error) {
    console.warn("[catalogo-local] no se pudo borrar la clave legada", error);
  }
  for (const clave of clavesCatalogo(storage)) {
    try {
      storage.removeItem(clave);
    } catch (error) {
      console.warn("[catalogo-local] no se pudo borrar el snapshot", error);
    }
  }
}

/**
 * Primer arranque con tenant conocido: descarta la clave legada global sin
 * migrarla. Es idempotente; sin tenant no toca nada.
 */
export function descartarCatalogoLegado(storage: StorageCatalogo | null, tenantId: string | null): void {
  if (!storage || !claveCatalogo(tenantId)) return;
  try {
    storage.removeItem(CLAVE_CATALOGO);
  } catch (error) {
    console.warn("[catalogo-local] no se pudo descartar la clave legada", error);
  }
}
