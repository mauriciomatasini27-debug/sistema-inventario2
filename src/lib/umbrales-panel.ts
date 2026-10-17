import { umbral_efectivo } from "../modules/alertas/stock-bajo.js";

export type CampoUmbral = "min_stock" | "reorder_qty";

export interface ProductoUmbral {
  readonly sku: string;
  readonly nombre: string;
  readonly sector: string;
  readonly minStock: number | null;
  readonly reorderQty: number | null;
}

export interface BorradorUmbral {
  readonly min: string;
  readonly reorder: string;
}

export interface CambioUmbral {
  readonly sku: string;
  readonly min_stock: number | null;
  readonly reorder_qty: number | null;
}

export interface ErrorFila {
  readonly min_stock?: string;
  readonly reorder_qty?: string;
}

export interface AnalisisUmbrales {
  readonly errores: ReadonlyMap<string, ErrorFila>;
  readonly cambios: ReadonlyArray<CambioUmbral>;
}

export type ResultadoCampo =
  | { readonly ok: true; readonly valor: number | null }
  | { readonly ok: false; readonly error: string };

const MENSAJE: Record<CampoUmbral, string> = {
  min_stock: "Poné un número entero desde 0",
  reorder_qty: "Poné un número entero desde 1",
};

const MINIMO: Record<CampoUmbral, number> = { min_stock: 0, reorder_qty: 1 };

export function parsearCampo(texto: string, campo: CampoUmbral): ResultadoCampo {
  const t = texto.trim();
  if (t === "") return { ok: true, valor: null };
  if (!/^\d+$/.test(t)) return { ok: false, error: MENSAJE[campo] };
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < MINIMO[campo]) return { ok: false, error: MENSAJE[campo] };
  return { ok: true, valor: n };
}

function borradorDe(p: ProductoUmbral): BorradorUmbral {
  return {
    min: p.minStock === null ? "" : String(p.minStock),
    reorder: p.reorderQty === null ? "" : String(p.reorderQty),
  };
}

export function borradoresIniciales(productos: ReadonlyArray<ProductoUmbral>): Map<string, BorradorUmbral> {
  return new Map(productos.map((p) => [p.sku, borradorDe(p)]));
}

export function sectoresDe(productos: ReadonlyArray<ProductoUmbral>): string[] {
  return [...new Set(productos.map((p) => p.sector))].sort();
}

export function borradoresDeSector(
  productos: ReadonlyArray<ProductoUmbral>,
  borradores: ReadonlyMap<string, BorradorUmbral>,
  sector: string,
  valor: BorradorUmbral,
): Map<string, BorradorUmbral> {
  const out = new Map(borradores);
  for (const p of productos) {
    if (p.sector === sector) out.set(p.sku, { ...valor });
  }
  return out;
}

export function analizarGuardado(
  productos: ReadonlyArray<ProductoUmbral>,
  borradores: ReadonlyMap<string, BorradorUmbral>,
): AnalisisUmbrales {
  const errores = new Map<string, ErrorFila>();
  const cambios: CambioUmbral[] = [];
  for (const p of productos) {
    const b = borradores.get(p.sku) ?? borradorDe(p);
    const min = parsearCampo(b.min, "min_stock");
    const re = parsearCampo(b.reorder, "reorder_qty");
    if (!min.ok || !re.ok) {
      errores.set(p.sku, {
        ...(min.ok ? {} : { min_stock: min.error }),
        ...(re.ok ? {} : { reorder_qty: re.error }),
      });
      continue;
    }
    if (min.valor !== p.minStock || re.valor !== p.reorderQty) {
      cambios.push({ sku: p.sku, min_stock: min.valor, reorder_qty: re.valor });
    }
  }
  return { errores, cambios };
}

export function payloadDeshacer(
  productos: ReadonlyArray<ProductoUmbral>,
  cambios: ReadonlyArray<CambioUmbral>,
): CambioUmbral[] {
  const previo = new Map(productos.map((p) => [p.sku, p]));
  const out: CambioUmbral[] = [];
  for (const c of cambios) {
    const p = previo.get(c.sku);
    if (p) out.push({ sku: p.sku, min_stock: p.minStock, reorder_qty: p.reorderQty });
  }
  return out;
}

export function sugeridoMinimo(ventaSemanal: number | null | undefined): number | null {
  if (typeof ventaSemanal !== "number" || !Number.isFinite(ventaSemanal)) return null;
  return umbral_efectivo(null, ventaSemanal);
}
