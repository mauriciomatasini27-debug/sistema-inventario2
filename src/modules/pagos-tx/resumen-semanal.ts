// Resumen semanal de pagos Lunes-Domingo (CS12/OP11).
// Núcleo puro: lee órdenes + facturas en memoria y arma el snapshot que el
// bot/email envían el lunes. El job del lunes vive en el adaptador (P1).
// Ventana en días UTC, igual que marcar_vencidas (el corte AR vive en P1).

import { DIA_MS, type PaymentOrder } from "../payments/ordenes.js";
import { derivar_estado, type FacturaServicio } from "../utilities/facturas_servicios.js";

export interface ItemSemana {
  readonly id: string;
  readonly concepto: string;
  readonly vence: string;
  readonly montoCentavos: bigint;
}

export interface DiaSemana {
  readonly fechaIso: string;
  readonly cantidad: number;
  readonly totalCentavos: bigint;
}

export interface ResumenSemanal {
  readonly lunesIso: string;
  readonly domingoIso: string;
  readonly ordenesEstaSemana: ItemSemana[];
  readonly ordenesVencidas: ItemSemana[];
  readonly facturasEstaSemana: ItemSemana[];
  readonly facturasVencidas: ItemSemana[];
  readonly totalCentavos: bigint;
  readonly porDia: DiaSemana[];
}

function iso_de(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Por qué UTC y no AR: las órdenes ya cortan por día UTC en marcar_vencidas;
// cambiar de corte acá partiría la semana en dos. El corte AR queda para P1.
export function semana_lunes_domingo(ahoraMs: number): { lunesMs: number; domingoMs: number } {
  const inicioHoy = ahoraMs - (ahoraMs % DIA_MS);
  const dow = new Date(inicioHoy).getUTCDay();
  const desdeLunes = (dow + 6) % 7;
  const lunesMs = inicioHoy - desdeLunes * DIA_MS;
  return { lunesMs, domingoMs: lunesMs + 6 * DIA_MS };
}

export function resumen_semanal_pagos(
  ordenes: ReadonlyArray<PaymentOrder>,
  facturas: ReadonlyArray<FacturaServicio>,
  ahoraMs: number,
): ResumenSemanal {
  const { lunesMs, domingoMs } = semana_lunes_domingo(ahoraMs);
  const finExcl = domingoMs + DIA_MS;
  const hoyIso = iso_de(ahoraMs - (ahoraMs % DIA_MS));
  const ordenesEstaSemana: ItemSemana[] = [];
  const ordenesVencidas: ItemSemana[] = [];
  for (const o of ordenes) {
    if (o.estado === "vencida") {
      ordenesVencidas.push({
        id: o.id,
        concepto: o.concepto,
        vence: iso_de(o.venceElMs),
        montoCentavos: o.montoCentavos,
      });
    } else if (o.estado === "preparada" && o.venceElMs >= lunesMs && o.venceElMs < finExcl) {
      ordenesEstaSemana.push({
        id: o.id,
        concepto: o.concepto,
        vence: iso_de(o.venceElMs),
        montoCentavos: o.montoCentavos,
      });
    }
  }
  const lunesIso = iso_de(lunesMs);
  const domingoIso = iso_de(domingoMs);
  const facturasEstaSemana: ItemSemana[] = [];
  const facturasVencidas: ItemSemana[] = [];
  for (const f of facturas) {
    const estado = derivar_estado(f, hoyIso);
    if (estado === "pagada") continue;
    if (estado === "vencida") {
      facturasVencidas.push({
        id: f.id,
        concepto: `${f.accountId} ${f.periodo}`,
        vence: f.vencimiento,
        montoCentavos: f.montoCentavos,
      });
    } else if (f.vencimiento >= lunesIso && f.vencimiento <= domingoIso) {
      facturasEstaSemana.push({
        id: f.id,
        concepto: `${f.accountId} ${f.periodo}`,
        vence: f.vencimiento,
        montoCentavos: f.montoCentavos,
      });
    }
  }
  const todos = [...ordenesEstaSemana, ...ordenesVencidas, ...facturasEstaSemana, ...facturasVencidas];
  const totalCentavos = todos.reduce((acc, i) => acc + i.montoCentavos, 0n);
  const porDiaMap = new Map<string, { cantidad: number; total: bigint }>();
  for (const i of todos) {
    const d = porDiaMap.get(i.vence) ?? { cantidad: 0, total: 0n };
    d.cantidad += 1;
    d.total += i.montoCentavos;
    porDiaMap.set(i.vence, d);
  }
  const porDia: DiaSemana[] = [...porDiaMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([fechaIso, d]) => ({ fechaIso, cantidad: d.cantidad, totalCentavos: d.total }));
  const porVence = (a: ItemSemana, b: ItemSemana) => (a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0);
  ordenesEstaSemana.sort(porVence);
  ordenesVencidas.sort(porVence);
  facturasEstaSemana.sort(porVence);
  facturasVencidas.sort(porVence);
  return {
    lunesIso,
    domingoIso,
    ordenesEstaSemana,
    ordenesVencidas,
    facturasEstaSemana,
    facturasVencidas,
    totalCentavos,
    porDia,
  };
}
