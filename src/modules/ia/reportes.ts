import type { NombreHerramienta } from "./asistente.js";

export interface ReporteOrigen {
  readonly href: string;
  readonly etiqueta: string;
}

const REPORTES: Record<NombreHerramienta, ReporteOrigen> = {
  top_productos: { href: "/panel/reportes", etiqueta: "reportes" },
  // Las ventas del mes salen del mismo resumen que la franja de KPIs del panel.
  ventas_periodo: { href: "/panel#kpi-strip", etiqueta: "resumen del panel" },
  por_vencer: { href: "/panel/stock", etiqueta: "stock y lotes" },
  deudores: { href: "/panel/fiado", etiqueta: "fiado" },
  stock_bajo: { href: "/panel/stock", etiqueta: "stock" },
  margen_producto: { href: "/panel/precios", etiqueta: "precios" },
  caja_dia: { href: "/panel/caja", etiqueta: "caja" },
  rotacion_lenta: { href: "/panel/reportes", etiqueta: "reportes" },
};

export function reporteDeHerramienta(herramienta: NombreHerramienta): ReporteOrigen {
  return REPORTES[herramienta];
}
