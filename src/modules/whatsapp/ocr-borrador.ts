import { construir_botones, type PayloadBotones } from "./envio.js";
import { formatear_pesos } from "./pedido.js";
import { verificarSumaItems, type Borrador } from "../purchases/facturas.js";
import { validarCuit } from "../purchases/proveedores.js";
import { fechaAR, sumarDiasAR } from "../../lib/fecha-ar.js";

// Oferta del borrador OCR por WhatsApp (PRD-OCR-01 OCR1-S5, ADR-0005). Núcleo
// puro: arma el cuerpo con los campos leídos y su confianza por campo, y los
// tres botones [Confirmar] [Editar] [Descartar] con la acción y el id del
// borrador en el id del botón (límite Meta: 3 botones, título de 20).

export const RESPUESTA_NO_COMPROBANTE =
  "Ese archivo no parece un comprobante. Mandame una foto o un PDF de la factura." as const;

export const RESPUESTA_OCR_MEDIA_FALLIDA =
  "No pude bajar el comprobante. Reintentá mandándolo de nuevo." as const;

export type AccionBotonOcr = "confirmar" | "editar" | "descartar" | "corregir" | "omitir";

// Interpreta el id `ocr:<acción>:<borradorId>` de un botón. Devuelve null si no
// es un id de OCR o la acción no es una de las cinco.
export function parsear_boton_ocr(id: string): { readonly accion: AccionBotonOcr; readonly borradorId: string } | null {
  const partes = id.split(":");
  if (partes.length !== 3 || partes[0] !== "ocr") return null;
  const accion = partes[1];
  const borradorId = partes[2] ?? "";
  if (accion !== "confirmar" && accion !== "editar" && accion !== "descartar" && accion !== "corregir" && accion !== "omitir") {
    return null;
  }
  if (!borradorId) return null;
  return { accion, borradorId };
}

export const RESPUESTA_OCR_DESCARTADO = "Listo, descarté el comprobante." as const;
export const RESPUESTA_OCR_EDITAR_WEB = "Para editar el borrador entrá a la web." as const;
export const RESPUESTA_OCR_BOTON_INVALIDO = "Ese botón ya no está disponible." as const;
export const RESPUESTA_OCR_SOLO_DUENO = "Solo el Dueño puede aprobar correcciones." as const;
export const RESPUESTA_OCR_CORREGIDO = "Listo, corregí el total." as const;

// El mime del adjunto decide si entra a la extracción; cuando no es
// comprobante el bot avisa sin crear job (la ingesta responde 415 al caller de
// API).
export function es_comprobante_desde_mime(mime: string | null | undefined): boolean {
  const m = (mime ?? "").toLowerCase();
  return m.startsWith("image/") || m === "application/pdf";
}

function id_boton_ocr(accion: AccionBotonOcr, borradorId: string): string {
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

export function avisos_borrador_ocr(b: Borrador, ahoraIso: string): string[] {
  const avisos: string[] = [];
  if (b.fechaIso !== null) {
    const hoy = fechaAR(Date.parse(ahoraIso));
    if (b.fechaIso > hoy) {
      avisos.push("La fecha del comprobante está en el futuro.");
    } else if (b.fechaIso < sumarDiasAR(hoy, -365)) {
      avisos.push("La fecha del comprobante es de hace más de un año.");
    }
  }
  if (b.totalCentavos !== null && b.totalCentavos <= 0n) {
    avisos.push("El total del comprobante no es positivo.");
  }
  if (b.cuit !== null && !validarCuit(b.cuit)) {
    avisos.push("El CUIT del comprobante no es válido.");
  }
  return avisos;
}

export interface PropuestaCorreccionOcr {
  readonly totalPropuestoCentavos: bigint;
}

// Solo propone si hay ítems y la suma no cierra con el total (tolerancia 1%);
// el Dueño decide y el bot nunca persiste la corrección sin ese toque.
export function propuesta_correccion_total(b: Borrador): PropuestaCorreccionOcr | null {
  if (b.totalCentavos === null || b.totalCentavos <= 0n || b.items.length === 0) return null;
  if (verificarSumaItems(b.items, b.totalCentavos).ok) return null;
  let suma = 0n;
  for (const it of b.items) suma += it.subtotalCentavos;
  return { totalPropuestoCentavos: suma };
}

export function cuerpo_borrador_ocr(b: Borrador, revisa: boolean, ahoraIso: string): string {
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
  lineas.push(...avisos_borrador_ocr(b, ahoraIso));
  return lineas.join("\n");
}

export function payload_borrador_ocr(b: Borrador, revisa: boolean, ahoraIso: string): PayloadBotones {
  return construir_botones(cuerpo_borrador_ocr(b, revisa, ahoraIso), [
    { id: id_boton_ocr("confirmar", b.id), titulo: "Confirmar" },
    { id: id_boton_ocr("editar", b.id), titulo: "Editar" },
    { id: id_boton_ocr("descartar", b.id), titulo: "Descartar" },
  ]);
}

export function payload_correccion_ocr(b: Borrador, propuesta: PropuestaCorreccionOcr): PayloadBotones {
  const total = b.totalCentavos === null ? "sin leer" : formatear_pesos(b.totalCentavos);
  const suma = formatear_pesos(propuesta.totalPropuestoCentavos);
  return construir_botones(
    `La suma de los ítems (${suma}) no coincide con el total (${total}). ¿Corrijo el total a ${suma}?`,
    [
      { id: id_boton_ocr("corregir", b.id), titulo: "Sí, corregir" },
      { id: id_boton_ocr("omitir", b.id), titulo: "No, dejarlo" },
    ],
  );
}
