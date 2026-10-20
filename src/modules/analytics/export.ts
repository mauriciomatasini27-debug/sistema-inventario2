// Núcleo puro RT8: CSV + decisión sync/worker + auditoría.
// PDF: contenido en export-pdf.ts y dibujo en export-pdf-pdfkit.ts.
import type { FilaRotacion } from "./tipos.js";

export function decidir_modo_export(totalFilas: number): "sincronico" | "worker" {
  return totalFilas <= 2000 ? "sincronico" : "worker";
}

function escCsv(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function fila_csv(f: FilaRotacion): string {
  const celdas = [
    f.sku,
    f.nombre,
    f.categoria ?? "",
    f.ubicacion ?? "",
    String(f.neto),
    String(f.bruto),
    String(f.devuelto),
    f.ventaDiaria === null ? "" : String(f.ventaDiaria),
    String(f.stockPromedio),
    f.rotacion === null ? "" : String(f.rotacion),
    String(f.vecesRepuesto),
    f.coberturaDias === null ? "" : String(f.coberturaDias),
    String(f.diasSinVenta),
    String(f.stockFinal),
    (f.valorizadoCentavos).toString(),
    (f.ingresosCentavos).toString(),
    (f.gananciaCentavos).toString(),
  ];
  return celdas.map(escCsv).join(",");
}

export function armar_csv(args: {
  readonly filas: ReadonlyArray<FilaRotacion>;
  readonly desde: string;
  readonly hasta: string;
  readonly generadoEn: string;
  readonly generador: string;
}): string {
  const head = [
    `# reporte rotacion ${args.desde}..${args.hasta} generado ${args.generadoEn} por ${args.generador}`,
    "sku,nombre,categoria,ubicacion,neto,bruto,devuelto,venta_diaria,stock_promedio,rotacion,veces_repuesto,cobertura_dias,dias_sin_venta,stock_final,valorizado_centavos,ingresos_centavos,ganancia_centavos",
  ];
  return `\uFEFF${head.join("\n")}\n${args.filas.map(fila_csv).join("\n")}\n`;
}

export function auditar_export(args: {
  readonly actor: string;
  readonly formato: "csv" | "pdf";
  readonly filas: number;
  readonly desde: string;
  readonly hasta: string;
}): { readonly accion: "export_rotacion"; readonly actor: string; readonly detalle: unknown } {
  return {
    accion: "export_rotacion",
    actor: args.actor,
    detalle: {
      formato: args.formato,
      filas: args.filas,
      desde: args.desde,
      hasta: args.hasta,
    },
  };
}
