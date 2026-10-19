import { construir_botones, type PayloadBotones } from "./envio.js";
import { formatear_pesos } from "./pedido.js";
import { verificarSumaItems, type Borrador, type ParcheBorrador } from "../purchases/facturas.js";
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

export type AccionBotonOcr = "confirmar" | "editar" | "descartar" | "corregir" | "omitir" | "aprobar" | "cancelar";

// Interpreta el id `ocr:<acción>:<borradorId>` de un botón. Devuelve null si no
// es un id de OCR o la acción no es una de las siete.
export function parsear_boton_ocr(id: string): { readonly accion: AccionBotonOcr; readonly borradorId: string } | null {
  const partes = id.split(":");
  if (partes.length !== 3 || partes[0] !== "ocr") return null;
  const accion = partes[1];
  const borradorId = partes[2] ?? "";
  if (
    accion !== "confirmar" &&
    accion !== "editar" &&
    accion !== "descartar" &&
    accion !== "corregir" &&
    accion !== "omitir" &&
    accion !== "aprobar" &&
    accion !== "cancelar"
  ) {
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
export const RESPUESTA_OCR_NO_ENTENDI = "No entendí. Escribí por ejemplo: monto 164800." as const;
export const RESPUESTA_OCR_CANCELADO = "Listo, no cambié nada." as const;
export const RESPUESTA_OCR_EDICION_RESUELTA = "Ese borrador ya no se puede editar." as const;
export const RESPUESTA_OCR_EDICION_VENCIDA = "El borrador venció y ya no se puede editar." as const;
export const RESPUESTA_OCR_EDICION_INVALIDA = "No pude aplicar esa corrección. Revisá el valor e intentá de nuevo." as const;

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

// FP3.3 (ADR-0005, ADR-0093): edición por texto del borrador OCR. El Dueño
// escribe `campo valor`; el bot valida con el núcleo, propone y espera un OK
// explícito antes de persistir.

export type CampoEditableOcr = "monto" | "fecha" | "proveedor" | "cuit";

export interface EdicionOcrTexto {
  readonly campo: CampoEditableOcr;
  readonly valor: string;
}

// `campo valor`: el primer token elige el campo y el resto del texto (con trim)
// es el valor crudo, tal como lo escribió el Dueño. Null si no reconoce la clave
// o no hay valor.
export function parsear_edicion_ocr(texto: string): EdicionOcrTexto | null {
  const m = /^(\S+)\s+([\s\S]+)$/.exec(texto.trim());
  if (!m) return null;
  const clave = (m[1] ?? "").toLowerCase();
  const valor = (m[2] ?? "").trim();
  if (!valor) return null;
  if (clave === "monto" || clave === "total") return { campo: "monto", valor };
  if (clave === "fecha") return { campo: "fecha", valor };
  if (clave === "proveedor") return { campo: "proveedor", valor };
  if (clave === "cuit") return { campo: "cuit", valor };
  return null;
}

export function parche_de_edicion(ed: EdicionOcrTexto): ParcheBorrador {
  if (ed.campo === "monto") return { totalTexto: ed.valor };
  if (ed.campo === "fecha") return { fechaTexto: ed.valor };
  if (ed.campo === "proveedor") return { nombreProveedor: ed.valor };
  return { cuitTexto: ed.valor };
}

export function cuerpo_pedir_edicion_ocr(b: Borrador): string {
  const total = b.totalCentavos === null ? "sin leer" : formatear_pesos(b.totalCentavos);
  return [
    "¿Qué corrijo?",
    `Monto actual: ${total}`,
    `Fecha actual: ${b.fechaIso ?? "sin leer"}`,
    `Proveedor actual: ${b.nombreProveedor ?? "sin leer"}`,
    `CUIT actual: ${b.cuit ? cuit_legible(b.cuit) : "sin leer"}`,
    "Escribí por ejemplo: monto 164800, fecha 10/10/2026, proveedor ACME, cuit 20-12345678-6",
  ].join("\n");
}

const ETIQUETA_EDICION: Record<CampoEditableOcr, string> = {
  monto: "el total",
  fecha: "la fecha",
  proveedor: "el proveedor",
  cuit: "el CUIT",
};

// El valor propuesto sale del borrador ya editado (validado por el núcleo); el
// crudo queda de respaldo por si el campo no llega a normalizarse.
function valor_editado_legible(campo: CampoEditableOcr, b: Borrador, crudo: string): string {
  if (campo === "monto") return b.totalCentavos === null ? crudo : formatear_pesos(b.totalCentavos);
  if (campo === "fecha") return b.fechaIso ?? crudo;
  if (campo === "proveedor") return b.nombreProveedor ?? crudo;
  return b.cuit ? cuit_legible(b.cuit) : crudo;
}

export function payload_propuesta_edicion_ocr(ed: EdicionOcrTexto, borradorPropuesto: Borrador): PayloadBotones {
  const valor = valor_editado_legible(ed.campo, borradorPropuesto, ed.valor);
  return construir_botones(`¿Cambio ${ETIQUETA_EDICION[ed.campo]} a ${valor}?`, [
    { id: id_boton_ocr("aprobar", borradorPropuesto.id), titulo: "OK" },
    { id: id_boton_ocr("cancelar", borradorPropuesto.id), titulo: "Cancelar" },
  ]);
}

// Respuesta al Dueño cuando el núcleo rechaza la edición (409 resuelto, 410
// vencido, 422 valor inválido). El borrador y la sesión quedan intactos.
export function mensaje_error_edicion(status: 404 | 409 | 410 | 422): string {
  if (status === 409) return RESPUESTA_OCR_EDICION_RESUELTA;
  if (status === 410) return RESPUESTA_OCR_EDICION_VENCIDA;
  if (status === 422) return RESPUESTA_OCR_EDICION_INVALIDA;
  return RESPUESTA_OCR_BOTON_INVALIDO;
}
