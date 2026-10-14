// Núcleo puro RT2: agregador al vuelo desde movimientos + stock inicial.
// Sin IO, sin Drizzle, sin reloj. El adaptador pagina la ventana en SQL;
// acá solo se deriva. P1 (product_daily_stats) alimenta el mismo FilaRotacion.
import type {
  FilaRotacion,
  FotoCatalogo,
  MovimientoVentana,
  ParamsVentana,
  Resultado,
  SkuRot,
} from "./tipos.js";
import { diaUTC, sumarDiasAR, type FechaAR } from "../../lib/fecha-ar.js";

function diaStr(d: Date): string {
  return diaUTC(d);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcular_rotacion(args: {
  readonly movimientos: ReadonlyArray<MovimientoVentana>;
  readonly stockInicial: ReadonlyMap<SkuRot, number>;
  readonly catalogo: ReadonlyArray<FotoCatalogo>;
  readonly params: ParamsVentana;
}): Resultado<ReadonlyArray<FilaRotacion>, "VENTANA_INVALIDA"> {
  const { desde, hasta, hoy, ventanaCoberturaDias } = args.params;
  if (!desde || !hasta || hasta < desde) return { ok: false, codigo: "VENTANA_INVALIDA" };
  const dCal = diasEntre(desde, hasta);
  if (dCal <= 0 || dCal > 400) return { ok: false, codigo: "VENTANA_INVALIDA" };

  // D efectivo global: días de la ventana con >=1 VENTA neta>0 (cualquier sku).
  const diasConVentaGlobal = new Set<string>();
  for (const m of args.movimientos) {
    if (m.tipo !== "VENTA") continue;
    const d = diaStr(m.creadoEn);
    if (d >= desde && d <= hasta) diasConVentaGlobal.add(d);
  }
  const dEfectivo = diasConVentaGlobal.size;

  // Agrupar por sku.
  const porSku = new Map<SkuRot, MovimientoVentana[]>();
  for (const m of args.movimientos) {
    const arr = porSku.get(m.sku);
    if (arr) arr.push(m);
    else porSku.set(m.sku, [m]);
  }

  const filas: FilaRotacion[] = [];
  for (const foto of args.catalogo) {
    const movs = porSku.get(foto.sku) ?? [];
    filas.push(
      filaSku({
        foto,
        movs,
        desde,
        hasta,
        hoy,
        dCal,
        dEfectivo,
        ventanaCoberturaDias,
        stockInicial: args.stockInicial.get(foto.sku) ?? 0,
      }),
    );
  }
  return { ok: true, valor: filas };
}

function filaSku(args: {
  foto: FotoCatalogo;
  movs: ReadonlyArray<MovimientoVentana>;
  desde: string;
  hasta: string;
  hoy: string;
  dCal: number;
  dEfectivo: number;
  ventanaCoberturaDias: number;
  stockInicial: number;
}): FilaRotacion {
  let bruto = 0;
  let devuelto = 0;
  let altasEventos = new Set<string>();
  const diasVenta = new Set<string>();
  let ultimaVenta: string | null = null;
  // Cierres diarios: reconstruir hacia adelante solo sobre días con movimiento
  // + stock inicial. Suma por día ordenada.
  const deltaPorDia = new Map<string, number>();
  for (const m of args.movs) {
    const d = diaStr(m.creadoEn);
    if (d < args.desde || d > args.hasta) continue;
    deltaPorDia.set(d, (deltaPorDia.get(d) ?? 0) + m.delta);
    if (m.tipo === "VENTA") {
      if (m.delta < 0) {
        bruto += -m.delta;
        diasVenta.add(d);
        if (ultimaVenta === null || d > ultimaVenta) ultimaVenta = d;
      } else if (m.delta > 0) {
        // Devolución: VENTA con delta positivo (netea, se imputa a su fecha).
        devuelto += m.delta;
      }
    }
    if (m.delta > 0 && (m.tipo === "ALTA" || m.tipo === "COMPENSATORIO")) {
      altasEventos.add(m.eventoId);
    }
  }
  const neto = bruto - devuelto;
  const diasConVenta = diasVenta.size;
  const diasSinVenta = args.dCal - diasConVenta;

  // Stock promedio = promedio de cierres diarios (RT2.3). Equivalente a
  // stock_días / D sin materializar matriz densa: tramos entre días con actividad.
  const diasOrdenados = [...deltaPorDia.keys()].sort();
  let stockPromedio: number;
  if (diasOrdenados.length === 0) {
    stockPromedio = args.stockInicial;
  } else {
    let cursor = args.stockInicial;
    let stockDias = 0;
    let diaCursor = args.desde;
    for (const d of diasOrdenados) {
      const tramo = diasEntre(diaCursor, diaAntes(d));
      if (tramo > 0) stockDias += cursor * tramo;
      cursor += deltaPorDia.get(d) ?? 0;
      stockDias += cursor * 1;
      diaCursor = diaDespues(d);
    }
    const resto = diasEntre(diaCursor, args.hasta);
    if (resto > 0) stockDias += cursor * resto;
    stockPromedio = round2(stockDias / args.dCal);
  }
  const stockFinal = args.foto.stockActual;

  const rotacion = stockPromedio === 0 ? null : round2(neto / stockPromedio);
  const ventaDiaria = args.dEfectivo === 0 ? null : round2(neto / args.dEfectivo);
  const coberturaDias =
    ventaDiaria === null || ventaDiaria <= 0 ? null : round2(stockFinal / ventaDiaria);

  const pocos = args.dEfectivo < 7 || bruto + devuelto < 5;
  const motivo = args.dEfectivo < 7 ? ("DIAS_LT7" as const) : bruto + devuelto < 5 ? ("VENTAS_LT3" as const) : null;

  return {
    sku: args.foto.sku,
    nombre: args.foto.nombre,
    categoria: args.foto.categoria,
    ubicacion: args.foto.ubicacion,
    bruto,
    devuelto,
    neto,
    diasConVenta,
    diasEfectivos: args.dEfectivo,
    diasSinVenta,
    stockInicial: args.stockInicial,
    stockFinal,
    stockPromedio,
    rotacion,
    ventaDiaria,
    coberturaDias,
    vecesRepuesto: altasEventos.size,
    costoCentavos: args.foto.costoCentavos,
    valorizadoCentavos: BigInt(stockFinal) * args.foto.costoCentavos,
    pocosDatos: pocos,
    motivoPocosDatos: motivo,
    ultimaVenta,
  };
}

export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(desde + "T00:00:00Z");
  const b = Date.parse(hasta + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function diaAntes(d: string): string {
  return sumarDiasAR(d as FechaAR, -1);
}

function diaDespues(d: string): string {
  return sumarDiasAR(d as FechaAR, 1);
}
