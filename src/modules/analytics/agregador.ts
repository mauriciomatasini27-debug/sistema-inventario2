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
  // RT2.6: ventana de cobertura independiente del filtro del tablero.
  // Sin ella la cobertura usa el promedio del tablero (comportamiento previo).
  readonly cobertura?:
    | {
        readonly desde: string;
        readonly hasta: string;
        readonly movimientos: ReadonlyArray<MovimientoVentana>;
      }
    | undefined;
}): Resultado<ReadonlyArray<FilaRotacion>, "VENTANA_INVALIDA"> {
  const { desde, hasta, hoy, ventanaCoberturaDias } = args.params;
  if (!desde || !hasta || hasta < desde) return { ok: false, codigo: "VENTANA_INVALIDA" };
  const dCal = diasEntre(desde, hasta);
  if (dCal <= 0 || dCal > 400) return { ok: false, codigo: "VENTANA_INVALIDA" };
  void ventanaCoberturaDias;

  // Neto de cobertura por sku (misma regla de neteo que el tablero).
  const netoCobertura = new Map<SkuRot, { neto: number; dEfectivo: number }>();
  if (args.cobertura) {
    const cob = args.cobertura;
    const porSku = new Map<SkuRot, { bruto: number; devuelto: number }>();
    for (const m of cob.movimientos) {
      const d = diaStr(m.creadoEn);
      if (d < cob.desde || d > cob.hasta) continue;
      const acc = porSku.get(m.sku) ?? { bruto: 0, devuelto: 0 };
      acumularVenta(acc, m);
      porSku.set(m.sku, acc);
    }
    for (const foto of args.catalogo) {
      const acc = porSku.get(foto.sku) ?? { bruto: 0, devuelto: 0 };
      netoCobertura.set(foto.sku, {
        neto: acc.bruto - acc.devuelto,
        dEfectivo: diasEntre(desdeEfectivo(cob.desde, foto.altaDia), cob.hasta),
      });
    }
  }

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
        stockInicial: args.stockInicial.get(foto.sku) ?? 0,
        netoCobertura: netoCobertura.get(foto.sku),
      }),
    );
  }
  return { ok: true, valor: filas };
}

// RT1.2: una venta suma al bruto; una devolución o un compensatorio que
// corrige una venta de más revierten (devuelto); un compensatorio que
// corrige una venta de menos suma al bruto. Todo imputado a su fecha.
function acumularVenta(acc: { bruto: number; devuelto: number }, m: MovimientoVentana): void {
  if (m.tipo === "VENTA") {
    if (m.delta < 0) acc.bruto += -m.delta;
    else if (m.delta > 0) acc.devuelto += m.delta;
  } else if (m.tipo === "COMPENSATORIO") {
    if (m.delta > 0) acc.devuelto += m.delta;
    else if (m.delta < 0) acc.bruto += -m.delta;
  }
}

function acumularDinero(
  acc: { ingresos: bigint; ganancia: bigint },
  m: MovimientoVentana,
): void {
  const imp = m.importeCentavos ?? 0n;
  const gan = m.gananciaCentavos ?? 0n;
  if (m.tipo === "VENTA") {
    if (m.delta < 0) {
      acc.ingresos += imp;
      acc.ganancia += gan;
    } else if (m.delta > 0) {
      acc.ingresos -= imp;
      acc.ganancia -= gan;
    }
  } else if (m.tipo === "COMPENSATORIO") {
    if (m.delta > 0) {
      acc.ingresos -= imp;
      acc.ganancia -= gan;
    } else if (m.delta < 0) {
      acc.ingresos += imp;
      acc.ganancia += gan;
    }
  }
}

function desdeEfectivo(desde: string, altaDia: string | undefined): string {
  if (altaDia !== undefined && altaDia > desde) return altaDia;
  return desde;
}

function filaSku(args: {
  foto: FotoCatalogo;
  movs: ReadonlyArray<MovimientoVentana>;
  desde: string;
  hasta: string;
  hoy: string;
  dCal: number;
  stockInicial: number;
  netoCobertura?: { neto: number; dEfectivo: number } | undefined;
}): FilaRotacion {
  const ventas = { bruto: 0, devuelto: 0 };
  const dinero = { ingresos: 0n, ganancia: 0n };
  let eventosVenta = 0;
  // RT2.5: un evento de reposición es un pedido distinto o un día con
  // al menos una carga manual. Devoluciones, ajustes y compensatorios no
  // reponen.
  const pedidos = new Set<string>();
  const diasCarga = new Set<string>();
  const diasVenta = new Set<string>();
  let ultimaVenta: string | null = null;
  // Cierres diarios: reconstruir hacia adelante solo sobre días con movimiento
  // + stock inicial. Suma por día ordenada.
  const deltaPorDia = new Map<string, number>();
  for (const m of args.movs) {
    const d = diaStr(m.creadoEn);
    if (d < args.desde || d > args.hasta) continue;
    deltaPorDia.set(d, (deltaPorDia.get(d) ?? 0) + m.delta);
    acumularVenta(ventas, m);
    acumularDinero(dinero, m);
    if ((m.tipo === "VENTA" && m.delta < 0) || (m.tipo === "COMPENSATORIO" && m.delta < 0)) {
      eventosVenta += 1;
    }
    if (m.tipo === "VENTA" && m.delta < 0) {
      diasVenta.add(d);
      if (ultimaVenta === null || d > ultimaVenta) ultimaVenta = d;
    }
    if (m.delta > 0 && m.tipo === "ALTA") {
      if (m.pedidoId !== undefined && m.pedidoId !== null) pedidos.add(m.pedidoId);
      else diasCarga.add(d);
    }
  }
  const bruto = ventas.bruto;
  const devuelto = ventas.devuelto;
  const neto = bruto - devuelto;
  const diasConVenta = diasVenta.size;
  // RT2.7: días desde la última venta (hoy − última, en días enteros).
  // Sin ventas: desde el alta ("Nunca vendido (alta hace N días)").
  const nuncaVendido = ultimaVenta === null;
  const baseSinVenta = ultimaVenta === null ? desdeEfectivo(args.desde, args.foto.altaDia) : ultimaVenta;
  const diasSinVenta = Math.max(0, diasEntre(baseSinVenta, args.hoy) - 1);
  // RT1.6/RT2.1: D efectivo propio desde el alta; el producto nuevo se marca.
  const dEfectivo = diasEntre(desdeEfectivo(args.desde, args.foto.altaDia), args.hasta);
  const esNuevo =
    args.foto.altaDia !== undefined && args.foto.altaDia >= args.desde && args.foto.altaDia <= args.hasta;

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
  // RT2.1: promedios sobre el D efectivo propio (×7 semana, ×30 mes,
  // derivados del ratio exacto para no arrastrar el redondeo diario).
  const ventaDiaria = dEfectivo === 0 ? null : round2(neto / dEfectivo);
  const ventaSemanal = dEfectivo === 0 ? null : round2((neto / dEfectivo) * 7);
  const ventaMensual = dEfectivo === 0 ? null : round2((neto / dEfectivo) * 30);
  // RT2.6: la cobertura usa la ventana propia (14/28/56d), no el filtro.
  let ventaDiariaCob = ventaDiaria;
  if (args.netoCobertura !== undefined) {
    const nc = args.netoCobertura;
    ventaDiariaCob = nc.dEfectivo === 0 ? null : round2(nc.neto / nc.dEfectivo);
  }
  const coberturaDias =
    ventaDiariaCob === null || ventaDiariaCob <= 0 ? null : round2(stockFinal / ventaDiariaCob);

  // RT2.9: menos de 7 días de historia o menos de 3 ventas en la ventana.
  const pocos = dEfectivo < 7 || eventosVenta < 3;
  const motivo = dEfectivo < 7 ? ("DIAS_LT7" as const) : eventosVenta < 3 ? ("VENTAS_LT3" as const) : null;

  const ingresos = dinero.ingresos;
  const ganancia = dinero.ganancia;
  const margenBp =
    ingresos <= 0n ? null : Number((ganancia * 10000n) / ingresos);
  const costoVendido = ingresos - ganancia;
  const markupBp =
    costoVendido <= 0n ? null : Number((ganancia * 10000n) / costoVendido);

  return {
    sku: args.foto.sku,
    nombre: args.foto.nombre,
    categoria: args.foto.categoria,
    ubicacion: args.foto.ubicacion,
    bruto,
    devuelto,
    neto,
    diasConVenta,
    diasEfectivos: dEfectivo,
    diasSinVenta,
    stockInicial: args.stockInicial,
    stockFinal,
    stockPromedio,
    rotacion,
    ventaDiaria,
    ventaSemanal,
    ventaMensual,
    coberturaDias,
    vecesRepuesto: pedidos.size + diasCarga.size,
    costoCentavos: args.foto.costoCentavos,
    valorizadoCentavos: BigInt(stockFinal) * args.foto.costoCentavos,
    ingresosCentavos: ingresos,
    gananciaCentavos: ganancia,
    margenBp,
    markupBp,
    pocosDatos: pocos,
    motivoPocosDatos: motivo,
    ultimaVenta,
    archivado: args.foto.archivado ?? false,
    esNuevo,
    nuncaVendido,
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
