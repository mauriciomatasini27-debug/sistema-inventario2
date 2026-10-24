import type { ItemVivo } from "./servicio.js";

const SIN_TILDES = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export interface FilaPuntajeMemoria {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly precioCentavos: bigint;
  readonly costoCentavos?: bigint | undefined;
  readonly proveedor?: string | null | undefined;
  readonly score: number;
}

// Misma escalera que buscar_en_catalogo (servicio): sku exacto, includes,
// nombre, alias; si todo queda en 0, una fila de prefijo a score 0.15.
export function puntuarMemoria(items: ReadonlyArray<ItemVivo>, termino: string, limite = 10): FilaPuntajeMemoria[] {
  const t = SIN_TILDES(termino).trim();
  if (!t) return [];
  const out: FilaPuntajeMemoria[] = [];
  for (const item of items) {
    const sku = SIN_TILDES(item.sku);
    const base = {
      sku: item.sku,
      nombre: item.nombre,
      stock: item.stock,
      umbral: item.umbral,
      precioCentavos: item.precioCentavos,
      ...(item.costoCentavos != null ? { costoCentavos: item.costoCentavos } : {}),
      ...(item.proveedor != null ? { proveedor: item.proveedor } : {}),
    };
    if (sku === t) {
      out.push({ ...base, score: 1 });
      continue;
    }
    const nombre = SIN_TILDES(item.nombre);
    let score = 0;
    if (sku.includes(t)) score = 0.9;
    else if (nombre === t) score = 1;
    else if (nombre.startsWith(t)) score = 0.9;
    else if (nombre.includes(t)) score = 0.7;
    else {
      const porPalabra = nombre.split(/\s+/).some((p) => p.startsWith(t));
      if (porPalabra) score = 0.6;
    }
    if (score === 0 && item.alias) {
      const hit = item.alias.some((a) => {
        const n = SIN_TILDES(a);
        return n === t || n.includes(t) || t.includes(n);
      });
      if (hit) score = 0.85;
    }
    if (score > 0) out.push({ ...base, score });
  }
  if (out.length === 0) {
    const sugerido = sugerenciaPrefijo(items, termino);
    if (sugerido) {
      out.push({
        sku: sugerido.sku,
        nombre: sugerido.nombre,
        stock: sugerido.stock,
        umbral: sugerido.umbral,
        precioCentavos: sugerido.precioCentavos,
        ...(sugerido.costoCentavos != null ? { costoCentavos: sugerido.costoCentavos } : {}),
        ...(sugerido.proveedor != null ? { proveedor: sugerido.proveedor } : {}),
        score: 0.15,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limite);
}

function sugerenciaPrefijo(catalogo: ReadonlyArray<ItemVivo>, termino: string): ItemVivo | null {
  const palabras = SIN_TILDES(termino)
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (palabras.length === 0) return null;
  for (const item of catalogo) {
    const nom = SIN_TILDES(item.nombre).split(/\s+/);
    if (palabras.some((p) => nom.some((n) => n.startsWith(p.slice(0, 3)) || p.startsWith(n.slice(0, 3))))) return item;
  }
  return null;
}
