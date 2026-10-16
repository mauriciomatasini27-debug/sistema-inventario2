// Núcleo puro RT1/RT3/RT4/RT5: selectores sobre FilaRotacion[].
// Sin IO. Orden determinista RT1.8 en todos los listados.
import type { FilaRotacion, RotationSettings, SkuRot } from "./tipos.js";

// RT1.8: neto DESC, bruto DESC, sku ASC. Mismo orden en tablero, bot y export.
export function cmpRanking(a: FilaRotacion, b: FilaRotacion): number {
  if (a.neto !== b.neto) return b.neto - a.neto;
  if (a.bruto !== b.bruto) return b.bruto - a.bruto;
  return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
}

export function ranking_neto(filas: ReadonlyArray<FilaRotacion>): FilaRotacion[] {
  return [...filas].sort(cmpRanking);
}

export interface CursorRT1 {
  readonly neto: number;
  readonly bruto: number;
  readonly sku: string;
}

// Keyset (RT1.7): nunca OFFSET. Predicado SQL equivalente en el adaptador:
// (neto, bruto, sku) < (cursor.neto, cursor.bruto, cursor.sku) en orden DESC,DESC,ASC.
export function pagina_ranking(
  filasOrdenadas: ReadonlyArray<FilaRotacion>,
  limite: number,
  cursor: CursorRT1 | null,
): { readonly items: ReadonlyArray<FilaRotacion>; readonly next: CursorRT1 | null } {
  let desde = 0;
  if (cursor) {
    desde = filasOrdenadas.findIndex((f) => {
      if (f.neto !== cursor.neto) return f.neto < cursor.neto;
      if (f.bruto !== cursor.bruto) return f.bruto < cursor.bruto;
      return f.sku > cursor.sku;
    });
    if (desde === -1) return { items: [], next: null };
  }
  const items = filasOrdenadas.slice(desde, desde + limite);
  const ultima = items[items.length - 1];
  return {
    items,
    next:
      ultima === undefined || items.length < limite
        ? null
        : { neto: ultima.neto, bruto: ultima.bruto, sku: ultima.sku },
  };
}

// RT3 ABC Pareto (P1): por ingresos netos (o neto × precio cuando el
// adaptador aún no informa importes). La clase la decide el acumulado
// previo: el producto que cruza el corte queda en la clase superior.
export type ClaseABC = "A" | "B" | "C" | "SinVentas" | "P1_pendiente";

export function clasificar_abc(
  filas: ReadonlyArray<FilaRotacion>,
  precios: ReadonlyMap<SkuRot, bigint>,
  settings: RotationSettings,
  dCal: number,
): ReadonlyArray<{ readonly sku: SkuRot; readonly clase: ClaseABC; readonly pctAcumBp: number }> {
  if (dCal < settings.abcMinDias) {
    return filas.map((f) => ({ sku: f.sku, clase: "P1_pendiente" as const, pctAcumBp: 0 }));
  }
  const conVentas = filas
    .map((f) => ({
      f,
      val: f.ingresosCentavos > 0n ? f.ingresosCentavos : BigInt(Math.max(0, f.neto)) * (precios.get(f.sku) ?? 0n),
    }))
    .filter((x) => x.val > 0n)
    .sort((a, b) => {
      if (a.val !== b.val) return a.val > b.val ? -1 : 1;
      return a.f.sku < b.f.sku ? -1 : 1;
    });
  const total = conVentas.reduce((acc, x) => acc + x.val, 0n);
  const out: { sku: SkuRot; clase: ClaseABC; pctAcumBp: number }[] = [];
  let acum = 0n;
  for (const x of conVentas) {
    const prevBp = total === 0n ? 0 : Number((acum * 10000n) / total);
    acum += x.val;
    const pctBp = total === 0n ? 0 : Number((acum * 10000n) / total);
    const clase: ClaseABC =
      prevBp < settings.abcCorteA_bp ? "A" : prevBp < settings.abcCorteB_bp ? "B" : "C";
    out.push({ sku: x.f.sku, clase, pctAcumBp: pctBp });
  }
  for (const f of filas) {
    if (!out.some((o) => o.sku === f.sku)) {
      out.push({ sku: f.sku, clase: "SinVentas", pctAcumBp: 10000 });
    }
  }
  return out;
}

// RT1.5 menos vendidos: solo activos con stock > 0. Ceros primero;
// desempate por valorización (Dueño) o días sin venta (Empleado).
export function ranking_menos_vendidos(
  filas: ReadonlyArray<FilaRotacion>,
  vista: "dueno" | "empleado",
): FilaRotacion[] {
  return filas
    .filter((f) => !f.archivado && f.stockFinal > 0)
    .sort((a, b) => {
      if (a.neto !== b.neto) return a.neto - b.neto;
      if (vista === "dueno" && a.valorizadoCentavos !== b.valorizadoCentavos) {
        return a.valorizadoCentavos > b.valorizadoCentavos ? -1 : 1;
      }
      if (vista === "empleado" && a.diasSinVenta !== b.diasSinVenta) {
        return b.diasSinVenta - a.diasSinVenta;
      }
      return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    });
}

// RT4 dormidos: diasSinVenta >= N y stock > 0 y no excluido ni pocos datos.
export type MotivoDormido = "sin_ventas" | "cobertura";

export interface Dormido {
  readonly sku: SkuRot;
  readonly diasSinVenta: number;
  readonly inmovilizadoCentavos: bigint;
  readonly critico: boolean;
  readonly motivos: ReadonlyArray<MotivoDormido>;
}

export function listar_dormidos(
  filas: ReadonlyArray<FilaRotacion>,
  excluidos: ReadonlySet<SkuRot>,
  settings: RotationSettings,
): Dormido[] {
  const out: Dormido[] = [];
  for (const f of filas) {
    if (f.stockFinal <= 0) continue;
    if (f.pocosDatos) continue;
    if (excluidos.has(f.sku)) continue;
    if (f.diasSinVenta < settings.dormidoN) continue;
    const motivos: MotivoDormido[] = ["sin_ventas"];
    if (f.coberturaDias !== null && f.coberturaDias >= settings.dormidoX) {
      motivos.push("cobertura");
    }
    out.push({
      sku: f.sku,
      diasSinVenta: f.diasSinVenta,
      inmovilizadoCentavos: f.valorizadoCentavos,
      critico: f.diasSinVenta >= settings.dormidoX,
      motivos,
    });
  }
  out.sort((a, b) => b.diasSinVenta - a.diasSinVenta || (a.sku < b.sku ? -1 : 1));
  return out;
}

// RT5 reponer primero: cobertura <= C días, sin pocos datos, venta diaria > 0.
// Orden: cobertura ASC, ventaDiaria DESC, sku ASC. Tercio superior = top
// ceil(n/3) del ranking neto entre candidatos.
export function reponer_primero(
  filas: ReadonlyArray<FilaRotacion>,
  settings: RotationSettings,
  // RT5.4: días hasta la próxima visita del proveedor. Los que no llegan
  // (cobertura < días) se informan en noLlega.
  opts?: { readonly diasHastaVisita?: number | null | undefined },
): {
  readonly items: ReadonlyArray<FilaRotacion>;
  readonly altaRotacion: ReadonlySet<SkuRot>;
  readonly noLlega: ReadonlySet<SkuRot>;
} {
  const candidatos = filas.filter(
    (f) =>
      !f.pocosDatos &&
      f.ventaDiaria !== null &&
      f.ventaDiaria > 0 &&
      f.coberturaDias !== null &&
      f.coberturaDias <= settings.coberturaReponerDias,
  );
  const porRank = ranking_neto(candidatos);
  const nAlta = Math.ceil(porRank.length / 3);
  const altaRotacion = new Set(porRank.slice(0, nAlta).map((f) => f.sku));
  const items = [...candidatos].sort((a, b) => {
    const ca = a.coberturaDias ?? Number.POSITIVE_INFINITY;
    const cb = b.coberturaDias ?? Number.POSITIVE_INFINITY;
    if (ca !== cb) return ca - cb;
    const va = a.ventaDiaria ?? 0;
    const vb = b.ventaDiaria ?? 0;
    if (va !== vb) return vb - va;
    return a.sku < b.sku ? -1 : 1;
  });
  // Rotación alta primero (RT5.3), estable dentro de cada grupo.
  const alta = items.filter((f) => altaRotacion.has(f.sku));
  const resto = items.filter((f) => !altaRotacion.has(f.sku));
  const dias = opts?.diasHastaVisita ?? null;
  const noLlega = new Set<SkuRot>();
  if (dias !== null) {
    for (const f of items) {
      if (f.coberturaDias !== null && f.coberturaDias < dias) noLlega.add(f.sku);
    }
  }
  return { items: [...alta, ...resto], altaRotacion, noLlega };
}

// RT5.6 (P1-ready, cálculo puro disponible ya): cantidad sugerida por cobertura
// objetivo. P0 la expone como ayuda; el pedido la confirma (F5).
// Con unidadesPorCaja se redondea a cajas enteras (F5.3).
export function cantidad_sugerida(args: {
  readonly ventaDiaria: number | null;
  readonly stockFinal: number;
  readonly diasObjetivo: number;
  readonly unidadesPorCaja?: number | null | undefined;
}): number {
  if (args.ventaDiaria === null || args.ventaDiaria <= 0) return 0;
  const unidades = Math.max(0, Math.ceil(args.ventaDiaria * args.diasObjetivo - args.stockFinal));
  const pack = args.unidadesPorCaja ?? null;
  if (pack === null || pack <= 0) return unidades;
  if (unidades === 0) return 0;
  return Math.ceil(unidades / pack) * pack;
}
