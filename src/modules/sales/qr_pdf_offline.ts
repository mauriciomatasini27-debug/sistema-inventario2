// Worker C — QR/PDF offline TV10 P1 (slice exclusivo C, aislado del repo).
//
// Diseñado contra `src/modules/sales/ticket_render.ts` (SOLO lectura):
// reutiliza sus invariantes y su formateo, con TIPOS PROPIOS MÍNIMOS
// copiados (el parent cablea el import real; acá NO hay import relativo
// al repo para no acoplar el slice al path de integración).
//
// API:
//   generar_qr_dataurl(linkPublico): Promise<string>  (QR offline vía `qrcode`)
//   generar_ticket_pdf(input): Promise<Buffer>        (ticket 58mm vía `pdfkit`)
//
// Respeto TV2/TV7: sin costos en ningún campo; leyenda obligatoria verificada
// (falla si falta, igual que verificar() de ticket_render.ts).
// Dinero: bigint centavos, formateo ARS es-AR (copia exacta de formatARS).
//
// Deps (NO instaladas en este slice — las instala el parent):
//   npm install qrcode pdfkit (+ @types/qrcode @types/pdfkit si aplica)
// Ver integrar.md para el comando exacto y el cableado en render.ts.

import QRCode from "qrcode";
import PDFDocument from "pdfkit";

export const LEYENDA_NO_FISCAL = "DOCUMENTO NO VÁLIDO COMO FACTURA" as const;

export type Medio = "Efectivo" | "Debito" | "Mercado Pago" | "QR" | "Transferencia";

/** Copia mínima de TicketEmitidoRender (ticket_render.ts). Sin costos. */
export type TicketEmitidoPdf =
  | {
      readonly kind: "online";
      readonly definitivo: string;
      readonly provisorio: string;
      readonly totalCentavos: bigint;
      readonly medio: Medio;
      readonly leyenda: typeof LEYENDA_NO_FISCAL;
      readonly pago?: "Pago: A cuenta" | undefined;
    }
  | {
      readonly kind: "offline";
      readonly definitivo: null;
      readonly provisorio: string;
      readonly totalCentavos: bigint;
      readonly medio: Medio;
      readonly leyenda: typeof LEYENDA_NO_FISCAL;
      readonly pago?: "Pago: A cuenta" | undefined;
    };

/** Copia mínima de LineaTicketRender (ticket_render.ts). Sin costos. */
export interface LineaTicketPdf {
  readonly sku: string;
  readonly cantidad: number;
  readonly brutoCentavos: bigint;
  readonly descLineaCentavos: bigint;
  readonly descTicketCentavos: bigint;
  readonly netoCentavos: bigint;
}

/** Copia mínima de TicketRenderInput (ticket_render.ts). */
export interface TicketPdfInput {
  readonly comercio: string;
  readonly ticket: TicketEmitidoPdf;
  readonly lineas: ReadonlyArray<LineaTicketPdf>;
  /** Link público TV9 (ej. https://.../t/<token>). Va al QR sin modificar. */
  readonly linkPublico: string;
  /** ISO con offset (doble hora TV17: se muestra tal cual). */
  readonly fechaIso: string;
}

/** ARS: centavos bigint -> "$ 3.700,00". Copia exacta de formatARS (ticket_render.ts). */
export function formatARS(centavos: bigint): string {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const pesos = abs / 100n;
  const resto = abs % 100n;
  const miles = new Intl.NumberFormat("es-AR").format(Number(pesos));
  return `$ ${negativo ? "-" : ""}${miles},${resto.toString().padStart(2, "0")}`;
}

function numeroVisible(t: TicketEmitidoPdf): string {
  return t.kind === "online" ? t.definitivo : `PROV ${t.provisorio} (offline)`;
}

/** Invariantes: copia exacta de verificar() (ticket_render.ts). Leyenda exacta,
// 1..50 líneas, suma netos == total, bruto-desc == total. Sin costos. */
function verificar(input: TicketPdfInput): {
  bruto: bigint;
  desc: bigint;
} {
  if (input.ticket.leyenda !== LEYENDA_NO_FISCAL) throw new Error("leyenda obligatoria ausente");
  if (input.lineas.length < 1 || input.lineas.length > 50) throw new Error("lineas fuera de rango 1..50");
  if (!input.linkPublico || !/^https?:\/\//.test(input.linkPublico)) throw new Error("linkPublico inválido");
  let bruto = 0n;
  let desc = 0n;
  let neto = 0n;
  for (const l of input.lineas) {
    if (!l.sku || !Number.isInteger(l.cantidad) || l.cantidad < 1 || l.cantidad > 999) {
      throw new Error(`linea inválida: ${l.sku}`);
    }
    if (l.brutoCentavos < 0n || l.descLineaCentavos < 0n || l.descTicketCentavos < 0n || l.netoCentavos < 0n) {
      throw new Error(`linea con monto negativo: ${l.sku}`);
    }
    if (l.brutoCentavos - l.descLineaCentavos - l.descTicketCentavos !== l.netoCentavos) {
      throw new Error(`linea no cuadra: ${l.sku}`);
    }
    bruto += l.brutoCentavos;
    desc += l.descLineaCentavos + l.descTicketCentavos;
    neto += l.netoCentavos;
  }
  if (neto !== input.ticket.totalCentavos) throw new Error("total no cuadra con suma de netos");
  if (bruto - desc !== input.ticket.totalCentavos) throw new Error("bruto - descuentos no cuadra con total");
  return { bruto, desc };
}

/** Ancho ticket térmico 58mm en puntos PDF (58 / 25.4 * 72 ≈ 164.4). */
const PAGE_W_PT = 164;
const MARGIN_PT = 8;
const CONTENT_W_PT = PAGE_W_PT - MARGIN_PT * 2;

/**
 * QR offline: codifica el link público tal cual en un PNG dataURL.
 * Falla si el link no es http(s). No usa API externa (a diferencia del
 * <img> contra api.qrserver.com de renderTicketHtml): funciona sin red.
 */
export async function generar_qr_dataurl(linkPublico: string): Promise<string> {
  if (!linkPublico || !/^https?:\/\//.test(linkPublico)) throw new Error("linkPublico inválido");
  const dataUrl: string = await QRCode.toDataURL(linkPublico, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("QR dataURL inválido");
  }
  return dataUrl;
}

/**
 * Ticket 58mm en PDF: comercio, números (definitivo o PROV offline),
 * fecha tal cual, líneas (sku, cantidad, bruto, desc, neto), BRUTO,
 * DESCUENTO (si > 0), TOTAL, medio (o pago "A cuenta"), leyenda en
 * recuadro, QR embebido + link en texto. Sin costos en ningún campo.
 * Falla si la leyenda falta/descuadra o si los totales no cuadran
 * (vía verificar(), igual que ticket_render.ts).
 */
export async function generar_ticket_pdf(input: TicketPdfInput): Promise<Buffer> {
  const { bruto, desc } = verificar(input);
  const t = input.ticket;

  const qrDataUrl = await generar_qr_dataurl(input.linkPublico);
  const qrPng = Buffer.from(qrDataUrl.slice("data:image/png;base64,".length), "base64");

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({
    size: [PAGE_W_PT, 792],
    margins: { top: MARGIN_PT, bottom: MARGIN_PT, left: MARGIN_PT, right: MARGIN_PT },
  });
  const done = new Promise<Buffer>((resolve, reject) => {
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

  doc.font("Courier").fontSize(9).text(input.comercio.slice(0, 32), { width: CONTENT_W_PT, align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(8).text(`Ticket ${numeroVisible(t)}`, { width: CONTENT_W_PT, align: "center" });
  if (t.kind === "online") {
    doc.text(`Provisorio: ${t.provisorio}`, { width: CONTENT_W_PT, align: "center" });
  }
  doc.text(input.fechaIso, { width: CONTENT_W_PT, align: "center" });
  doc.moveDown(0.4);
  doc.text("-".repeat(24), { width: CONTENT_W_PT, align: "center" });

  for (const l of input.lineas) {
    const d = l.descLineaCentavos + l.descTicketCentavos;
    doc.fontSize(8).text(`${l.cantidad}x ${l.sku}`.slice(0, 32), { width: CONTENT_W_PT });
    doc.fontSize(7).text(`bruto ${formatARS(l.brutoCentavos)} neto ${formatARS(l.netoCentavos)}`, {
      width: CONTENT_W_PT,
    });
    if (d > 0n) {
      doc.text(`desc -${formatARS(d)}`, { width: CONTENT_W_PT });
    }
  }

  doc.text("-".repeat(24), { width: CONTENT_W_PT, align: "center" });
  doc.fontSize(8).text(`BRUTO ${formatARS(bruto)}`, { width: CONTENT_W_PT });
  if (desc > 0n) {
    doc.text(`DESCUENTO -${formatARS(desc)}`, { width: CONTENT_W_PT });
  }
  doc.fontSize(11).text(`TOTAL ${formatARS(t.totalCentavos)}`, { width: CONTENT_W_PT });
  doc.fontSize(8).text(`Medio: ${t.pago ?? t.medio}`, { width: CONTENT_W_PT });
  doc.moveDown(0.4);

  const leyY = doc.y;
  doc.rect(MARGIN_PT, leyY, CONTENT_W_PT, 20).stroke();
  doc.fontSize(7).text(LEYENDA_NO_FISCAL, MARGIN_PT, leyY + 5, { width: CONTENT_W_PT, align: "center" });
  doc.y = leyY + 24;
  doc.moveDown(0.4);

  const qrSize = 120;
  doc.image(qrPng, PAGE_W_PT / 2 - qrSize / 2, doc.y, { width: qrSize, height: qrSize });
  doc.y += qrSize + 4;
  doc.fontSize(6).text(input.linkPublico, { width: CONTENT_W_PT, align: "center" });

  doc.end();
  return done;
}
