// Núcleo puro RT9: sugerencia determinista 10/15/20% con piso de costo.
// Nada se aplica solo: el comerciante confirma (Confirmar reforzado).
import type { Resultado, SkuRot } from "./tipos.js";

export type PromoPct = 10 | 15 | 20;

export interface SugerenciaPromo {
  readonly pct: PromoPct;
  readonly precioPromoCentavos: bigint;
  readonly pisoCentavos: bigint;
  readonly viable: boolean;
  readonly gananciaCentavos: bigint;
}

export function piso_costo(costoCentavos: bigint, markupMinBp: number): bigint {
  return ((costoCentavos * BigInt(10000 + markupMinBp)) + 5000n) / 10000n;
}

export function precio_con_pct(vigenteCentavos: bigint, pct: PromoPct): bigint {
  return ((vigenteCentavos * BigInt(100 - pct)) + 50n) / 100n;
}

export function sugerir_promo(args: {
  readonly vigenteCentavos: bigint;
  readonly costoCentavos: bigint;
  readonly markupMinBp: number;
}): ReadonlyArray<SugerenciaPromo> {
  const piso = piso_costo(args.costoCentavos, args.markupMinBp);
  const pcts: PromoPct[] = [10, 15, 20];
  return pcts.map((pct) => {
    const precio = precio_con_pct(args.vigenteCentavos, pct);
    return {
      pct,
      precioPromoCentavos: precio,
      pisoCentavos: piso,
      viable: precio >= piso,
      gananciaCentavos: precio - args.costoCentavos,
    };
  });
}

export function confirmar_promo(args: {
  readonly sku: SkuRot;
  readonly pct: number;
  readonly vigenteCentavos: bigint;
  readonly costoCentavos: bigint;
  readonly markupMinBp: number;
  readonly confirmado: boolean;
  readonly vistos: ReadonlyMap<string, string>;
  readonly idempotencyKey: string;
}): Resultado<{ readonly sku: SkuRot; readonly pct: PromoPct; readonly precioPromoCentavos: bigint }, "PCT_INVALIDO" | "PISO_VIOLADO" | "SIN_CONFIRMAR" | "YA_VISTA"> {
  if (args.pct !== 10 && args.pct !== 15 && args.pct !== 20) {
    return { ok: false, codigo: "PCT_INVALIDO" };
  }
  if (!args.confirmado) return { ok: false, codigo: "SIN_CONFIRMAR" };
  const visto = args.vistos.get(args.idempotencyKey);
  if (visto) return { ok: false, codigo: "YA_VISTA" };
  const precio = precio_con_pct(args.vigenteCentavos, args.pct);
  if (precio < piso_costo(args.costoCentavos, args.markupMinBp)) {
    return { ok: false, codigo: "PISO_VIOLADO" };
  }
  return { ok: true, valor: { sku: args.sku, pct: args.pct, precioPromoCentavos: precio } };
}
