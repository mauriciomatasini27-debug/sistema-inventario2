import { fechaAR, horaAR, horaMinutoAR, sumarDiasAR, type FechaAR } from "./fecha-ar.js";

// P3-7c (ADR-0020): agregados read-only del panel. Todo cálculo es puro sobre
// filas ya leídas; la fuente de ventas es `sales` (una fila por venta, `medio`
// siempre presente y append-only: las correcciones de medio son filas nuevas,
// no UPDATE). El día/hora salen de Buenos Aires vía fecha-ar (ARQ-S2).

export interface VentaResumenRow {
  readonly saleId: string;
  readonly medio: string;
  readonly totalCentavos: bigint;
  readonly ocurridoEn: Date;
}

export interface DevolucionResumenRow {
  readonly montoCentavos: bigint;
  readonly medio: string;
  readonly ocurridoEn: Date;
}

export interface CorreccionResumenRow {
  readonly saleId: string;
  readonly medioNuevo: string;
  readonly ocurridoEn: Date;
}

export interface ProductoResumenRow {
  readonly stockActual: number;
  readonly minStock: number | null;
}

export interface TurnoResumenRow {
  readonly fecha: FechaAR;
  readonly turno: string;
  readonly entregadoPor: string;
  readonly estado: string;
  readonly creadoEn: Date | null;
}

export interface DatosResumen {
  readonly ventas: readonly VentaResumenRow[];
  readonly devoluciones: readonly DevolucionResumenRow[];
  readonly correcciones: readonly CorreccionResumenRow[];
  readonly productos: readonly ProductoResumenRow[];
  readonly turnos: readonly TurnoResumenRow[];
}

export interface MesResumen {
  readonly mes: string;
  readonly efectivo_centavos: string;
  readonly digital_centavos: string;
}

export interface MedioResumen {
  readonly medio: string;
  readonly centavos: string;
}

export interface HeatResumen {
  readonly dia_semana: number;
  readonly hora: number;
  readonly tickets: number;
}

export interface TurnoPanel {
  readonly hora: string;
  readonly turno: string;
  readonly entregado_por: string;
  readonly estado: string;
}

export interface ResumenPanel {
  readonly tickets_hoy: number;
  readonly stock_bajo: number;
  readonly ventas_mes_centavos: string;
  readonly ventas_por_mes: MesResumen[];
  readonly por_medio: MedioResumen[];
  readonly heatmap: HeatResumen[];
  readonly turnos: TurnoPanel[];
}

export function mesDeFecha(fecha: FechaAR): string {
  return fecha.slice(0, 7);
}

export function diaSemanaDeFecha(fecha: FechaAR): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export function ultimos12Meses(ahora: Date): string[] {
  const hoy = fechaAR(ahora);
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = mes - i;
    const y = anio + Math.floor((m - 1) / 12);
    const mm = (((m - 1) % 12) + 12) % 12 + 1;
    out.push(`${y}-${String(mm).padStart(2, "0")}`);
  }
  return out;
}

function compararCentavos(a: string, b: string): number {
  const ca = BigInt(a);
  const cb = BigInt(b);
  if (ca > cb) return -1;
  if (ca < cb) return 1;
  return 0;
}

function restar(a: bigint, b: bigint): bigint {
  const r = a - b;
  return r < 0n ? 0n : r;
}

function medioEfectivoPorVenta(
  ventas: readonly VentaResumenRow[],
  correcciones: readonly CorreccionResumenRow[],
): Map<string, string> {
  const ultima = new Map<string, { medio: string; cuando: number }>();
  for (const c of correcciones) {
    const cuando = c.ocurridoEn.getTime();
    const previa = ultima.get(c.saleId);
    if (!previa || cuando >= previa.cuando) ultima.set(c.saleId, { medio: c.medioNuevo, cuando });
  }
  const ventasIds = new Set(ventas.map((v) => v.saleId));
  const efectivo = new Map<string, string>();
  for (const [saleId, v] of ultima) if (ventasIds.has(saleId)) efectivo.set(saleId, v.medio);
  return efectivo;
}

export function construirResumen(ahora: Date, datos: DatosResumen): ResumenPanel {
  const hoy = fechaAR(ahora);
  const mesActual = mesDeFecha(hoy);
  const desdeHeat = sumarDiasAR(hoy, -27);

  let ticketsHoy = 0;
  let ventasMes = 0n;
  const meses = new Map(ultimos12Meses(ahora).map((m) => [m, { efectivo: 0n, digital: 0n }]));
  const porMedioMes = new Map<string, bigint>();
  const heat = new Map<string, number>();
  const medioEfectivo = medioEfectivoPorVenta(datos.ventas, datos.correcciones);

  for (const venta of datos.ventas) {
    const fecha = fechaAR(venta.ocurridoEn);
    const mes = mesDeFecha(fecha);
    const medio = medioEfectivo.get(venta.saleId) ?? venta.medio;
    if (fecha === hoy) ticketsHoy += 1;
    if (mes === mesActual) {
      ventasMes += venta.totalCentavos;
      porMedioMes.set(medio, (porMedioMes.get(medio) ?? 0n) + venta.totalCentavos);
    }
    const bucket = meses.get(mes);
    if (bucket) {
      if (medio === "Efectivo") bucket.efectivo += venta.totalCentavos;
      else bucket.digital += venta.totalCentavos;
    }
    if (fecha >= desdeHeat && fecha <= hoy) {
      const clave = `${diaSemanaDeFecha(fecha)}:${horaAR(venta.ocurridoEn)}`;
      heat.set(clave, (heat.get(clave) ?? 0) + 1);
    }
  }

  for (const devolucion of datos.devoluciones) {
    const fecha = fechaAR(devolucion.ocurridoEn);
    const mes = mesDeFecha(fecha);
    if (mes === mesActual) {
      ventasMes = restar(ventasMes, devolucion.montoCentavos);
      porMedioMes.set(devolucion.medio, restar(porMedioMes.get(devolucion.medio) ?? 0n, devolucion.montoCentavos));
    }
    const bucket = meses.get(mes);
    if (bucket) {
      if (devolucion.medio === "Efectivo") bucket.efectivo = restar(bucket.efectivo, devolucion.montoCentavos);
      else bucket.digital = restar(bucket.digital, devolucion.montoCentavos);
    }
  }

  const stockBajo = datos.productos.filter((p) => p.minStock !== null && p.stockActual < p.minStock).length;

  const turnos: TurnoPanel[] = datos.turnos
    .filter((t) => t.fecha === hoy)
    .sort((a, b) => (b.creadoEn?.getTime() ?? 0) - (a.creadoEn?.getTime() ?? 0))
    .map((t) => ({
      hora: t.creadoEn ? horaMinutoAR(t.creadoEn) : "—",
      turno: t.turno,
      entregado_por: t.entregadoPor,
      estado: t.estado,
    }));

  const heatmap: HeatResumen[] = [...heat.entries()]
    .map(([clave, tickets]) => {
      const [dia, hora] = clave.split(":");
      return { dia_semana: Number(dia), hora: Number(hora), tickets };
    })
    .sort((a, b) => a.dia_semana - b.dia_semana || a.hora - b.hora);

  const porMedio: MedioResumen[] = [...porMedioMes.entries()]
    .map(([medio, centavos]) => ({ medio, centavos: centavos.toString() }))
    .sort((a, b) => compararCentavos(a.centavos, b.centavos) || a.medio.localeCompare(b.medio));

  return {
    tickets_hoy: ticketsHoy,
    stock_bajo: stockBajo,
    ventas_mes_centavos: ventasMes.toString(),
    ventas_por_mes: [...meses.entries()].map(([mes, b]) => ({
      mes,
      efectivo_centavos: b.efectivo.toString(),
      digital_centavos: b.digital.toString(),
    })),
    por_medio: porMedio,
    heatmap,
    turnos,
  };
}
