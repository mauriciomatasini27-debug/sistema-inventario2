// LANE D — TV4 descuentos por línea + por ticket (ADR-0004).
//
// Núcleo puro: sin IO, sin Drizzle, sin store. Opera sobre el snapshot de
// precio de Lane C (precioCentavos ya congelado): jamás recalcula precios,
// solo descuenta. El orquestador (vender_mostrador) lo compone en orden fijo.
//
// Orden fijo: primero descuento por línea, luego descuento por ticket
// prorrateado sobre el neto de cada línea. Dinero siempre bigint centavos.
// Porcentajes en puntos base (1bp = 0.01%): mitad-arriba con enteros.
// Prorrateo del ticket con mayor resto (largest remainder): parte entera por
// piso y los centavos sueltos van a las líneas con mayor resto, desempate por
// índice. Total nunca negativo: cualquier descuento que lo vuelva negativo
// es DESCUENTO_INVALIDO (422), nunca se silencia con tope.

export type DescuentoSpec =
  | { readonly tipo: "monto"; readonly montoCentavos: bigint }
  | { readonly tipo: "porcentaje"; readonly porcentajeBp: number };

// 1bp..10000bp = 0.01%..100%. Más de 100% no es descuento, es error.
export const PORCENTAJE_MIN_BP = 1;
export const PORCENTAJE_MAX_BP = 10_000;

import { esCantidadValida, subtotalLinea } from "./linea_peso.js";

export interface LineaBase {
  readonly sku: string;
  readonly cantidad: number;
  readonly precioCentavos: bigint;
  readonly porPeso?: boolean | undefined;
}

// Snapshot por línea para ticket_lines: bruto + descuento de línea +
// porción prorrateada del ticket + neto final. Todo congelado.
export interface LineaConDescuento {
  readonly idx: number;
  readonly sku: string;
  readonly cantidad: number;
  readonly brutoCentavos: bigint;
  readonly descLineaCentavos: bigint;
  readonly descTicketCentavos: bigint;
  readonly netoCentavos: bigint;
}

export interface CalculoDescuentos {
  readonly lineas: ReadonlyArray<LineaConDescuento>;
  readonly totalBrutoCentavos: bigint;
  readonly totalDescLineaCentavos: bigint;
  readonly totalDescTicketCentavos: bigint;
  readonly totalDescuentoCentavos: bigint;
  readonly totalNetoCentavos: bigint;
}

export type FalloDescuento = { readonly ok: false; readonly codigo: "DESCUENTO_INVALIDO"; readonly status: 422 };
export type CalculoDescuentosResult = { readonly ok: true; readonly calculo: CalculoDescuentos } | FalloDescuento;

function esLineaValida(l: LineaBase): boolean {
  return !!l.sku && esCantidadValida(l.cantidad, l.porPeso) && l.precioCentavos >= 0n;
}

function esSpecValido(s: DescuentoSpec): boolean {
  if (s.tipo === "monto") return s.montoCentavos >= 0n;
  return Number.isInteger(s.porcentajeBp) && s.porcentajeBp >= PORCENTAJE_MIN_BP && s.porcentajeBp <= PORCENTAJE_MAX_BP;
}

// Mitad-arriba con enteros: (base * bp + 5000) / 10000.
function porcentajeDe(base: bigint, bp: number): bigint {
  return (base * BigInt(bp) + 5_000n) / 10_000n;
}

function descuentoSobreNeto(neto: bigint, spec: DescuentoSpec): bigint | null {
  if (!esSpecValido(spec)) return null;
  if (spec.tipo === "monto") {
    if (spec.montoCentavos > neto) return null;
    return spec.montoCentavos;
  }
  return porcentajeDe(neto, spec.porcentajeBp);
}

// Prorrateo con mayor resto: reparte totalExacto sobre bases proporcionales
// sin perder ni crear centavos. Bases en 0 reciben 0; si el total a repartir
// es > 0 pero todas las bases son 0, no hay proporción definible => null.
function prorratearMayorResto(totalExacto: bigint, bases: ReadonlyArray<bigint>): bigint[] | null {
  const totalBases = bases.reduce((acc, b) => acc + b, 0n);
  if (totalExacto < 0n) return null;
  if (totalExacto === 0n) return bases.map(() => 0n);
  if (totalBases <= 0n) return null;
  const pisos: bigint[] = [];
  const restos: Array<{ idx: number; resto: bigint }> = [];
  let sumaPisos = 0n;
  for (let i = 0; i < bases.length; i++) {
    const base = bases[i] as bigint;
    const num = base * totalExacto;
    const piso = num / totalBases;
    pisos.push(piso);
    restos.push({ idx: i, resto: num % totalBases });
    sumaPisos += piso;
  }
  let sueltos = totalExacto - sumaPisos;
  restos.sort((a, b) => {
    if (a.resto !== b.resto) return a.resto > b.resto ? -1 : 1;
    return a.idx - b.idx;
  });
  const out = [...pisos];
  for (const r of restos) {
    if (sueltos <= 0n) break;
    out[r.idx] = (out[r.idx] as bigint) + 1n;
    sueltos -= 1n;
  }
  return out;
}

// Orden fijo línea-primero-ticket-después. descuentosLinea usa el índice de
// la línea (ausente/null => sin descuento en esa línea). descuentoTicket
// null/undefined => sin descuento de ticket.
export function aplicar_descuentos(args: {
  readonly lineas: ReadonlyArray<LineaBase>;
  readonly descuentosLinea?: ReadonlyArray<DescuentoSpec | null | undefined>;
  readonly descuentoTicket?: DescuentoSpec | null | undefined;
}): CalculoDescuentosResult {
  const { lineas, descuentosLinea, descuentoTicket } = args;
  if (lineas.length === 0 || lineas.length > 50) {
    return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };
  }
  for (const l of lineas) {
    if (!esLineaValida(l)) return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };
  }
  if (descuentosLinea !== undefined && descuentosLinea.length !== lineas.length) {
    return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };
  }

  const brutos = lineas.map((l) => subtotalLinea(l.cantidad, l.precioCentavos, l.porPeso));
  const descsLinea: bigint[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const spec = descuentosLinea?.[i] ?? null;
    if (spec == null) {
      descsLinea.push(0n);
      continue;
    }
    const d = descuentoSobreNeto(brutos[i] as bigint, spec);
    if (d === null) return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };
    descsLinea.push(d);
  }
  const netas = brutos.map((b, i) => b - (descsLinea[i] as bigint));
  if (netas.some((n) => n < 0n)) return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };

  const totalNetoLineas = netas.reduce((acc, n) => acc + n, 0n);
  let totalTicket = 0n;
  if (descuentoTicket != null) {
    if (descuentoTicket.tipo === "monto") {
      if (!esSpecValido(descuentoTicket)) return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };
      if (descuentoTicket.montoCentavos > totalNetoLineas) {
        return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };
      }
      totalTicket = descuentoTicket.montoCentavos;
    } else {
      if (!esSpecValido(descuentoTicket)) return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };
      totalTicket = porcentajeDe(totalNetoLineas, descuentoTicket.porcentajeBp);
    }
  }

  const prorrateo = prorratearMayorResto(totalTicket, netas);
  if (prorrateo === null) return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };

  const out: LineaConDescuento[] = lineas.map((l, i) => {
    const bruto = brutos[i] as bigint;
    const dl = descsLinea[i] as bigint;
    const dt = prorrateo[i] as bigint;
    return Object.freeze({
      idx: i,
      sku: l.sku,
      cantidad: l.cantidad,
      brutoCentavos: bruto,
      descLineaCentavos: dl,
      descTicketCentavos: dt,
      netoCentavos: bruto - dl - dt,
    });
  });
  if (out.some((l) => l.netoCentavos < 0n)) return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };

  const totalBruto = brutos.reduce((acc, b) => acc + b, 0n);
  const totalLinea = descsLinea.reduce((acc, d) => acc + d, 0n);
  const totalNeto = totalBruto - totalLinea - totalTicket;
  if (totalNeto < 0n) return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };

  return {
    ok: true,
    calculo: Object.freeze({
      lineas: Object.freeze(out),
      totalBrutoCentavos: totalBruto,
      totalDescLineaCentavos: totalLinea,
      totalDescTicketCentavos: totalTicket,
      totalDescuentoCentavos: totalLinea + totalTicket,
      totalNetoCentavos: totalNeto,
    }),
  };
}
