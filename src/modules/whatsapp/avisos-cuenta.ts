// WA-AVISOS-1: Avisos de cuenta por WhatsApp (decisión de Mauri 2026-11-21 04:15: salen por
// WhatsApp y no por mail). Núcleo puro: qué plantilla de Meta corresponde a
// cada fila de email_outbox y con qué parámetros. Sin IO.
// Las plantillas se crean y aprueban en Meta como UTILITY, idioma es_AR; el
// id aprobado va en WHATSAPP_PLANTILLAS_APROBADAS (clave = nombre de Meta).

import { fechaAR } from "../../lib/fecha-ar.js";
import { construir_plantilla, type PayloadPlantilla } from "./envio.js";

export const IDIOMA_AVISOS_WA = "es_AR" as const;
export const DIAS_HASTA_BORRADO = 90;

// WA-AVISOS-1: Plantilla de email_outbox -> plantilla de Meta. Estas filas las manda el job
// de WhatsApp; el de mails las saltea.
export const PLANTILLAS_AVISO_WA = {
  // P10-90 (#372): 7 días antes del borrado. {{1}} comercio, {{2}} cierre, {{3}} borrado.
  retencion_aviso_v1: "aviso_borrado_datos",
  // P10-91 (#379): al cerrar la cuenta. {{1}} comercio, {{2}} cierre, {{3}} borrado.
  cuenta_cerrada_v1: "aviso_cuenta_cerrada",
} as const;

export type PlantillaEmailAvisoWa = keyof typeof PLANTILLAS_AVISO_WA;
export const PLANTILLAS_EMAIL_AVISO_WA = Object.keys(PLANTILLAS_AVISO_WA) as PlantillaEmailAvisoWa[];

export interface FilaAviso {
  readonly plantilla: string;
  readonly idempotencyKey: string;
  readonly texto: string;
}

// WA-AVISOS-1: "2026-11-21" -> "21/11/2026"; otro formato pasa tal cual.
function dmy(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha;
}

function fecha_ar(d: Date): string {
  return dmy(fechaAR(d));
}

function vars_json(texto: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(texto) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function texto_no_vacio(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

// WA-AVISOS-1: Devuelve el nombre de Meta y los parámetros, o null si la fila no es un
// aviso de WhatsApp o le faltan datos (queda fallida, no se adivina).
export function aviso_wa(fila: FilaAviso, comercio: string): { readonly plantilla: string; readonly payload: PayloadPlantilla } | null {
  if (fila.plantilla === "retencion_aviso_v1") {
    // WA-AVISOS-1: #372 encola texto armado; la fecha de cierre viaja en la clave
    // "retencion-aviso:<tenant>:<cierre ISO>".
    const cierreIso = fila.idempotencyKey.split(":").slice(2).join(":");
    const cierre = new Date(cierreIso);
    if (!cierreIso || Number.isNaN(cierre.getTime())) return null;
    const borrado = new Date(cierre.getTime() + DIAS_HASTA_BORRADO * 86_400_000);
    const nombre = PLANTILLAS_AVISO_WA.retencion_aviso_v1;
    return { plantilla: nombre, payload: construir_plantilla(nombre, IDIOMA_AVISOS_WA, [comercio, fecha_ar(cierre), fecha_ar(borrado)]) };
  }
  if (fila.plantilla === "cuenta_cerrada_v1") {
    // WA-AVISOS-1: #379 encola con encolarEnvio: las vars van como JSON en texto.
    const v = vars_json(fila.texto);
    const cerrada = texto_no_vacio(v?.cerrada_el);
    const borrado = texto_no_vacio(v?.borrado_desde);
    if (!cerrada || !borrado) return null;
    const nombre = PLANTILLAS_AVISO_WA.cuenta_cerrada_v1;
    const deComercio = texto_no_vacio(v?.comercio) ?? comercio;
    return { plantilla: nombre, payload: construir_plantilla(nombre, IDIOMA_AVISOS_WA, [deComercio, dmy(cerrada), dmy(borrado)]) };
  }
  return null;
}
