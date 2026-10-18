import { construir_botones, type PayloadBotones } from "./envio.js";
import { formatear_pesos } from "./pedido.js";
import type { Borrador } from "../purchases/facturas.js";

// Oferta del borrador OCR por WhatsApp (PRD-OCR-01 OCR1-S5, ADR-0005). Núcleo
// puro: arma el cuerpo con los campos leídos y su confianza por campo, y los
// tres botones [Confirmar] [Editar] [Descartar] con la acción y el id del
// borrador en el id del botón (límite Meta: 3 botones, título de 20).

export const RESPUESTA_NO_COMPROBANTE =
  "Ese archivo no parece un comprobante. Mandame una foto o un PDF de la factura." as const;

export const RESPUESTA_OCR_MEDIA_FALLIDA =
  "No pude bajar el comprobante. Reintentá mandándolo de nuevo." as const;

export type AccionBotonOcr = "confirmar" | "editar" | "descartar";

// Interpreta el id `ocr:<acción>:<borradorId>` de un botón. Devuelve null si no
// es un id de OCR o la acción no es una de las tres.
export function parsear_boton_ocr(id: string): { readonly accion: AccionBotonOcr; readonly borradorId: string } | null {
  const partes = id.split(":");
  if (partes.length !== 3 || partes[0] !== "ocr") return null;
  const accion = partes[1];
  const borradorId = partes[2] ?? "";
  if (accion !== "confirmar" && accion !== "editar" && accion !== "descartar") return null;
  if (!borradorId) return null;
  return { accion, borradorId };
}

export const RESPUESTA_OCR_DESCARTADO = "Listo, descarté el comprobante." as const;
export const RESPUESTA_OCR_EDITAR_WEB = "Para editar el borrador entrá a la web." as const;
export const RESPUESTA_OCR_BOTON_INVALIDO = "Ese botón ya no está disponible." as const;

// El mime del adjunto decide si entra a la extracción; cuando no es
// comprobante el bot avisa sin crear job (la ingesta responde 415 al caller de
// API).
export function es_comprobante_desde_mime(mime: string | null | undefined): boolean {
  const m = (mime ?? "").toLowerCase();
  return m.startsWith("image/") || m === "application/pdf";
}

function id_boton_ocr(accion: "confirmar" | "editar" | "descartar", borradorId: string): string {
  return `ocr:${accion}:${borradorId}`;
}

function linea(etiqueta: string, valor: string, confianza: string): string {
  return `• ${etiqueta} ${valor} — confianza ${confianza}`;
}

// El borrador guarda el CUIT en 11 dígitos; en el mensaje va como en el papel.
function cuit_legible(cuit: string): string {
  const d = cuit.replace(/\D/g, "");
  return /^\d{11}$/.test(d) ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit;
}

export function cuerpo_borrador_ocr(b: Borrador, revisa: boolean): string {
  const proveedor = b.nombreProveedor ?? "Sin proveedor";
  const cuit = b.cuit ? `(CUIT ${cuit_legible(b.cuit)})` : "(CUIT sin leer)";
  const fecha = b.fechaIso ?? "sin leer";
  const total = b.totalCentavos === null ? "sin leer" : formatear_pesos(b.totalCentavos);
  const lineas = [
    "Leí tu comprobante:",
    linea(proveedor, cuit, b.confianza.cuit),
    linea("Fecha", fecha, b.confianza.fecha),
    linea("Total", total, b.confianza.total),
  ];
  if (revisa) lineas.push("Revisá los datos antes de confirmar.");
  return lineas.join("\n");
}

export function payload_borrador_ocr(b: Borrador, revisa: boolean): PayloadBotones {
  return construir_botones(cuerpo_borrador_ocr(b, revisa), [
    { id: id_boton_ocr("confirmar", b.id), titulo: "Confirmar" },
    { id: id_boton_ocr("editar", b.id), titulo: "Editar" },
    { id: id_boton_ocr("descartar", b.id), titulo: "Descartar" },
  ]);
}