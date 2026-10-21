export interface ProductoCatalogo {
  sku: string;
  nombre: string;
  precioCentavos: number | string;
  min_stock?: number | null;
  reorder_qty?: number | null;
}

export const LOCALE_PRECIO = "es-AR";
export const FORMATO_PRECIO = {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const;

export function pesosDesdeCentavos(centavos: number | string): number {
  const numero = Number(centavos);
  return Number.isFinite(numero) ? numero / 100 : 0;
}

const NOMBRE_LARGO_SIN_ESPACIOS = "Producto" + "X".repeat(80);

export function catalogoMil(n = 1000): ProductoCatalogo[] {
  return Array.from({ length: n }, (_, i) => {
    const numero = i + 1;
    const digitos = (i % 9) + 1;
    return {
      sku: `MIL-${String(numero).padStart(4, "0")}`,
      nombre: i % 7 === 0 ? `${NOMBRE_LARGO_SIN_ESPACIOS}-${numero}` : `Producto ${numero}`,
      precioCentavos: Number(String(digitos).repeat(digitos)),
      min_stock: i % 3 === 0 ? null : (i % 50) + 1,
      reorder_qty: i % 3 === 0 ? null : (i % 20) + 1,
    };
  });
}

export function modoHarnessCatalogo(url: URL, dev: boolean): "mil" | null {
  if (!dev) return null;
  return url.searchParams.get("data") === "mil" ? "mil" : null;
}

interface AlmacenCatalogo {
  items: ProductoCatalogo[];
  oyentes: Set<(items: ProductoCatalogo[]) => void>;
}

type GlobalConCatalogo = typeof globalThis & { __catalogoPanel?: AlmacenCatalogo };

function almacen(): AlmacenCatalogo {
  const g = globalThis as GlobalConCatalogo;
  if (!g.__catalogoPanel) g.__catalogoPanel = { items: [], oyentes: new Set() };
  return g.__catalogoPanel;
}

export function publicarCatalogo(items: ProductoCatalogo[]): void {
  const s = almacen();
  s.items = items;
  for (const oyente of [...s.oyentes]) oyente(items);
}

export function suscribirCatalogo(oyente: (items: ProductoCatalogo[]) => void): () => void {
  const s = almacen();
  s.oyentes.add(oyente);
  oyente(s.items);
  return () => {
    s.oyentes.delete(oyente);
  };
}

export function leerCatalogo(): ProductoCatalogo[] {
  return almacen().items;
}

interface AlmacenSkuSeleccionado {
  sku: string | null;
  oyentes: Set<(sku: string | null) => void>;
}

type GlobalConSku = typeof globalThis & { __catalogoSkuSeleccionado?: AlmacenSkuSeleccionado };

function almacenSkuSeleccionado(): AlmacenSkuSeleccionado {
  const g = globalThis as GlobalConSku;
  if (!g.__catalogoSkuSeleccionado) g.__catalogoSkuSeleccionado = { sku: null, oyentes: new Set() };
  return g.__catalogoSkuSeleccionado;
}

// La fila seleccionada de TablaCatalogo es la del SKU elegido en el formulario
// de la página; se compara sin espacios ni mayúsculas porque el input es libre.
export function skuNormalizado(sku: string | null | undefined): string | null {
  const t = (sku ?? "").trim().toUpperCase();
  return t === "" ? null : t;
}

export function marcarSkuSeleccionado(sku: string | null): void {
  const s = almacenSkuSeleccionado();
  const n = skuNormalizado(sku);
  if (s.sku === n) return;
  s.sku = n;
  for (const oyente of [...s.oyentes]) oyente(n);
}

export function leerSkuSeleccionado(): string | null {
  return almacenSkuSeleccionado().sku;
}

export function suscribirSkuSeleccionado(oyente: (sku: string | null) => void): () => void {
  const s = almacenSkuSeleccionado();
  s.oyentes.add(oyente);
  oyente(s.sku);
  return () => {
    s.oyentes.delete(oyente);
  };
}
