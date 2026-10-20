// Núcleo puro RT8.2: contenido estructurado del reporte de rotación.
// Sin pdfkit, sin reloj y sin azar: `generadoEn` e `id` entran por argumento.
import { fechaAR, horaMinutoAR } from "../../lib/fecha-ar.js";
import { formatARS } from "../sales/ticket_render.js";
import type { FilaRotacion } from "./tipos.js";

export const TITULO_REPORTE = "Reporte de rotación";
export const SECCION_FORMULAS = "Cómo se calculan las métricas";
export const TEXTO_SIN_PRODUCTOS = "Sin productos en el período";
export const FILAS_POR_PAGINA = 15;

export interface TotalesRotacion {
  readonly productos: number;
  readonly unidadesNetas: number;
  readonly ingresosCentavos: bigint;
  readonly gananciaCentavos: bigint;
}

export function totales_rotacion(filas: ReadonlyArray<FilaRotacion>): TotalesRotacion {
  let productos = 0;
  let unidadesNetas = 0;
  let ingresosCentavos = 0n;
  let gananciaCentavos = 0n;
  for (const f of filas) {
    productos += 1;
    unidadesNetas += f.neto;
    ingresosCentavos += f.ingresosCentavos;
    gananciaCentavos += f.gananciaCentavos;
  }
  return { productos, unidadesNetas, ingresosCentavos, gananciaCentavos };
}

export interface FilaReportePdf {
  readonly sku: string;
  readonly nombre: string;
  readonly neto: string;
  readonly rotacion: string;
  readonly cobertura: string;
  readonly ingresos: string;
  readonly ganancia: string;
}

export interface PaginaReportePdf {
  readonly numero: number;
  readonly totalPaginas: number;
  readonly pie: string;
  readonly filas: ReadonlyArray<FilaReportePdf>;
}

export interface IndicadorReportePdf {
  readonly etiqueta: string;
  readonly valor: string;
}

export interface FormulaReportePdf {
  readonly titulo: string;
  readonly texto: string;
}

export interface ReporteRotacionPdf {
  readonly id: string;
  readonly titulo: string;
  readonly comercio: string;
  readonly cuit: string | null;
  readonly periodo: string;
  readonly filtros: ReadonlyArray<string>;
  readonly generadoEn: string;
  readonly generador: string;
  readonly totales: TotalesRotacion;
  readonly indicadores: ReadonlyArray<IndicadorReportePdf>;
  readonly paginas: ReadonlyArray<PaginaReportePdf>;
  readonly sinProductos: boolean;
  readonly seccionFormulas: string;
  readonly formulas: ReadonlyArray<FormulaReportePdf>;
}

const FORMULAS: ReadonlyArray<FormulaReportePdf> = [
  {
    titulo: "Unidades vendidas netas",
    texto: "Ventas del período menos las devoluciones del período.",
  },
  {
    titulo: "Venta diaria",
    texto: "Unidades vendidas netas dividido por los días efectivos del período.",
  },
  {
    titulo: "Stock promedio",
    texto: "Promedio simple del stock al cierre de cada día del período.",
  },
  {
    titulo: "Rotación",
    texto: "Unidades vendidas netas dividido por el stock promedio del período. Si el stock promedio es cero se muestra n/d.",
  },
  {
    titulo: "Cobertura",
    texto: "Stock actual dividido por la venta promedio diaria de los últimos 28 días. Si no hubo ventas en esa ventana se muestra n/d.",
  },
  {
    titulo: "Ingresos netos",
    texto: "Suma de las ventas del período menos las devoluciones, con el precio y el costo congelados al momento de cada venta.",
  },
  {
    titulo: "Ganancia bruta",
    texto: "Ingresos netos menos el costo de lo vendido en el período.",
  },
];

function fechaHoraAR(iso: string): string {
  const d = new Date(iso);
  const [anio, mes, dia] = fechaAR(d).split("-");
  return `${dia}/${mes}/${anio} ${horaMinutoAR(d)}`;
}

function decimalAR(n: number, decimales: number): string {
  return n.toFixed(decimales).replace(".", ",");
}

function fila_reporte(f: FilaRotacion): FilaReportePdf {
  return {
    sku: f.sku,
    nombre: f.nombre,
    neto: String(f.neto),
    rotacion: f.rotacion === null ? "n/d" : decimalAR(f.rotacion, 2),
    cobertura: f.coberturaDias === null ? "n/d" : decimalAR(f.coberturaDias, 1),
    ingresos: formatARS(f.ingresosCentavos),
    ganancia: formatARS(f.gananciaCentavos),
  };
}

export function armar_reporte_pdf(args: {
  readonly filas: ReadonlyArray<FilaRotacion>;
  readonly desde: string;
  readonly hasta: string;
  readonly comercio: string;
  readonly cuit?: string | undefined;
  readonly generadoEn: string;
  readonly generador: string;
  readonly id: string;
  readonly filtros?: ReadonlyArray<string> | undefined;
}): ReporteRotacionPdf {
  const totales = totales_rotacion(args.filas);
  const totalPaginas = Math.max(1, Math.ceil(args.filas.length / FILAS_POR_PAGINA));
  const paginas: PaginaReportePdf[] = [];
  for (let i = 0; i < totalPaginas; i += 1) {
    const numero = i + 1;
    const inicio = i * FILAS_POR_PAGINA;
    paginas.push({
      numero,
      totalPaginas,
      pie: `página ${numero} de ${totalPaginas}`,
      filas: args.filas.slice(inicio, inicio + FILAS_POR_PAGINA).map(fila_reporte),
    });
  }
  const cuit = args.cuit?.trim() ? args.cuit.trim() : null;
  return {
    id: args.id,
    titulo: TITULO_REPORTE,
    comercio: args.comercio.trim() || "Comercio",
    cuit,
    periodo: `${args.desde} a ${args.hasta}`,
    filtros: args.filtros && args.filtros.length > 0 ? args.filtros : ["Ninguno"],
    generadoEn: fechaHoraAR(args.generadoEn),
    generador: args.generador,
    totales,
    indicadores: [
      { etiqueta: "Productos", valor: String(totales.productos) },
      { etiqueta: "Unidades netas", valor: String(totales.unidadesNetas) },
      { etiqueta: "Ingresos", valor: formatARS(totales.ingresosCentavos) },
      { etiqueta: "Ganancia", valor: formatARS(totales.gananciaCentavos) },
    ],
    paginas,
    sinProductos: args.filas.length === 0,
    seccionFormulas: SECCION_FORMULAS,
    formulas: FORMULAS,
  };
}
