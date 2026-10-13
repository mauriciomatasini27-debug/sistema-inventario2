// Nivel 1 — Conteo por sector (puro, sin IO).
// Sector cuelga de producto (products.sector, default 'general'): el único
// punto que ya agrupa por sku sin romper FEFO ni append-only.
// El conteo compara teórico vs físico SOLO del sector pedido y emite
// movimientos COMPENSATORIO vinculados (nunca UPDATE de stock).

import type { MovimientoStock, Sku } from "./inventario.js";

export const SECTOR_DEFECTO = "general" as const;
const SECTOR_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function normalizarSector(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return SECTOR_DEFECTO;
  if (!SECTOR_RE.test(s)) return SECTOR_DEFECTO;
  return s;
}

export interface LineaFisica {
  readonly sku: Sku;
  readonly fisico: number;
}

export interface DiferenciaConteo {
  readonly sku: Sku;
  readonly teorico: number;
  readonly fisico: number;
  readonly diferencia: number;
}

export type FalloConteo =
  | { readonly ok: false; readonly codigo: "SECTOR_INVALIDO"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "LINEA_INVALIDA"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "SIN_IDEMKEY"; readonly status: 422 };

export interface ConteoOk {
  readonly sector: string;
  readonly diferencias: ReadonlyArray<DiferenciaConteo>;
  readonly movimientos: ReadonlyArray<MovimientoStock>;
  readonly skusContados: number;
  readonly unidadesAjuste: number;
}

function esEnteroEnRango(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

// Teórico entra como snapshot readonly (store.stock o stock_lots agregado);
// sectorDe mapea sku -> sector normalizado. Solo se cuenta lo del sector.
export function conteo_por_sector(args: {
  readonly teorico: ReadonlyMap<string, number>;
  readonly fisico: ReadonlyArray<LineaFisica>;
  readonly sectorDe: ReadonlyMap<string, string>;
  readonly sector: string;
  readonly idemKey: string;
  readonly motivo?: string;
}): { readonly ok: true; readonly valor: ConteoOk } | FalloConteo {
  if (!args.idemKey) return { ok: false, codigo: "SIN_IDEMKEY", status: 422 };
  const sector = normalizarSector(args.sector);
  if (!sector) return { ok: false, codigo: "SECTOR_INVALIDO", status: 422 };
  if (args.fisico.length === 0) return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };
  const vistos = new Set<string>();
  for (const l of args.fisico) {
    if (!l.sku || !esEnteroEnRango(l.fisico, 0, 9999)) return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };
    if (vistos.has(l.sku as string)) return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };
    vistos.add(l.sku as string);
    const sec = normalizarSector(args.sectorDe.get(l.sku as string));
    if (sec !== sector) return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };
  }
  const motivo = (args.motivo ?? `conteo ${sector}`).trim().slice(0, 280) || `conteo ${sector}`;
  const diferencias: DiferenciaConteo[] = [];
  const movimientos: MovimientoStock[] = [];
  let unidades = 0;
  for (const l of args.fisico) {
    const teorico = args.teorico.get(l.sku as string) ?? 0;
    const diferencia = l.fisico - teorico;
    diferencias.push({ sku: l.sku, teorico, fisico: l.fisico, diferencia });
    if (diferencia !== 0) {
      movimientos.push({
        idemKey: args.idemKey,
        sku: l.sku,
        loteId: null,
        delta: diferencia,
        tipo: "COMPENSATORIO",
        motivo,
      });
      unidades += Math.abs(diferencia);
    }
  }
  diferencias.sort((a, b) => ((a.sku as string) < (b.sku as string) ? -1 : 1));
  return {
    ok: true,
    valor: { sector, diferencias, movimientos, skusContados: diferencias.length, unidadesAjuste: unidades },
  };
}
