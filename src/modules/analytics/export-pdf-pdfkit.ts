// Adaptador RT8.2: dibuja el reporte estructurado con pdfkit. Sin lógica de negocio.
import PDFDocument from "pdfkit";
import {
  TEXTO_SIN_PRODUCTOS,
  type PaginaReportePdf,
  type ReporteRotacionPdf,
  type FilaReportePdf,
} from "./export-pdf.js";

const MARGEN = 40;
const ANCHO_CONTENIDO = 595.28 - MARGEN * 2;
const ALTO_PAGINA = 841.89;

const COLUMNAS: ReadonlyArray<{ readonly clave: keyof FilaReportePdf; readonly titulo: string; readonly x: number; readonly ancho: number; readonly align?: "left" | "right" }> = [
  { clave: "sku", titulo: "SKU", x: 40, ancho: 55 },
  { clave: "nombre", titulo: "Producto", x: 95, ancho: 135 },
  { clave: "neto", titulo: "Neto", x: 230, ancho: 35, align: "right" },
  { clave: "rotacion", titulo: "Rotación", x: 265, ancho: 50, align: "right" },
  { clave: "cobertura", titulo: "Cobertura", x: 315, ancho: 50, align: "right" },
  { clave: "ingresos", titulo: "Ingresos", x: 365, ancho: 85, align: "right" },
  { clave: "ganancia", titulo: "Ganancia", x: 450, ancho: 105, align: "right" },
];

function escribir(doc: PDFKit.PDFDocument, texto: string, x: number, y: number, opciones: PDFKit.Mixins.TextOptions): void {
  doc.text(texto, x, y, opciones);
}

function encabezado(doc: PDFKit.PDFDocument, reporte: ReporteRotacionPdf, pagina: PaginaReportePdf): number {
  let y = MARGEN;
  doc.font("Helvetica-Bold").fontSize(pagina.numero === 1 ? 16 : 12).fillColor("#111111");
  escribir(doc, reporte.comercio, MARGEN, y, { width: ANCHO_CONTENIDO });
  y += pagina.numero === 1 ? 22 : 18;
  if (reporte.cuit) {
    doc.font("Helvetica").fontSize(9).fillColor("#444444");
    escribir(doc, `CUIT ${reporte.cuit}`, MARGEN, y, { width: ANCHO_CONTENIDO });
    y += 12;
  }
  doc.font("Helvetica-Bold").fontSize(pagina.numero === 1 ? 15 : 12).fillColor("#111111");
  escribir(doc, reporte.titulo, MARGEN, y, { width: ANCHO_CONTENIDO });
  y += pagina.numero === 1 ? 20 : 16;
  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  escribir(doc, `Período ${reporte.periodo}`, MARGEN, y, { width: ANCHO_CONTENIDO });
  y += 12;
  escribir(doc, `Filtros ${reporte.filtros.join(", ")}`, MARGEN, y, { width: ANCHO_CONTENIDO });
  y += 12;
  if (pagina.numero === 1) {
    escribir(doc, `Generado ${reporte.generadoEn} por ${reporte.generador}`, MARGEN, y, { width: ANCHO_CONTENIDO });
    y += 12;
    escribir(doc, `Identificador ${reporte.id}`, MARGEN, y, { width: ANCHO_CONTENIDO });
    y += 18;
    y = indicadores(doc, reporte, y);
  }
  return y + 6;
}

function indicadores(doc: PDFKit.PDFDocument, reporte: ReporteRotacionPdf, y: number): number {
  const ancho = ANCHO_CONTENIDO / reporte.indicadores.length;
  reporte.indicadores.forEach((ind, i) => {
    const x = MARGEN + i * ancho;
    doc.font("Helvetica").fontSize(8).fillColor("#555555");
    escribir(doc, ind.etiqueta, x, y, { width: ancho - 6 });
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111");
    escribir(doc, ind.valor, x, y + 11, { width: ancho - 6 });
  });
  return y + 34;
}

function tabla(doc: PDFKit.PDFDocument, pagina: PaginaReportePdf, y: number): number {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111111");
  for (const col of COLUMNAS) {
    escribir(doc, col.titulo, col.x, y, { width: col.ancho, align: col.align ?? "left", lineBreak: false });
  }
  y += 12;
  doc.moveTo(MARGEN, y - 3).lineTo(MARGEN + ANCHO_CONTENIDO, y - 3).strokeColor("#999999").stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#222222");
  for (const fila of pagina.filas) {
    for (const col of COLUMNAS) {
      // Por qué height: sin alto, pdfkit parte el nombre largo en varias líneas encima de la fila siguiente.
      escribir(doc, fila[col.clave], col.x, y, {
        width: col.ancho,
        height: 10,
        align: col.align ?? "left",
        ellipsis: true,
      });
    }
    y += 16;
  }
  return y;
}

function formulas(doc: PDFKit.PDFDocument, reporte: ReporteRotacionPdf, y: number): void {
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111");
  escribir(doc, reporte.seccionFormulas, MARGEN, y, { width: ANCHO_CONTENIDO });
  y += 18;
  for (const f of reporte.formulas) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111111");
    escribir(doc, f.titulo, MARGEN, y, { width: ANCHO_CONTENIDO });
    y += 11;
    doc.font("Helvetica").fontSize(8.5).fillColor("#333333");
    const alto = doc.heightOfString(f.texto, { width: ANCHO_CONTENIDO });
    escribir(doc, f.texto, MARGEN, y, { width: ANCHO_CONTENIDO });
    y += alto + 4;
  }
}

function pie(doc: PDFKit.PDFDocument, pagina: PaginaReportePdf): void {
  // Por qué: escribir dentro del margen inferior hace que pdfkit agregue una hoja en blanco.
  const margenInferior = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font("Helvetica").fontSize(8).fillColor("#555555");
  escribir(doc, pagina.pie, MARGEN, ALTO_PAGINA - MARGEN, {
    width: ANCHO_CONTENIDO,
    align: "center",
    lineBreak: false,
  });
  doc.page.margins.bottom = margenInferior;
}

export async function generar_reporte_pdf(reporte: ReporteRotacionPdf): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
    info: { Title: reporte.titulo, Author: reporte.generador, Subject: reporte.periodo },
  });
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", (err: Error) => {
      reject(err);
    });
  });

  reporte.paginas.forEach((pagina, i) => {
    if (i > 0) doc.addPage();
    let y = encabezado(doc, reporte, pagina);
    if (reporte.sinProductos) {
      doc.font("Helvetica").fontSize(10).fillColor("#333333");
      escribir(doc, TEXTO_SIN_PRODUCTOS, MARGEN, y + 6, { width: ANCHO_CONTENIDO });
      y += 30;
    } else {
      y = tabla(doc, pagina, y);
    }
    if (pagina.numero === pagina.totalPaginas) {
      formulas(doc, reporte, y + 18);
    }
    pie(doc, pagina);
  });

  doc.end();
  return listo;
}
