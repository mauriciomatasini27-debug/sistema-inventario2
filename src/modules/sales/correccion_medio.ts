// LANE D — TV14 corrección de medio auditada (ADR-0004, P1).
//
// Núcleo puro: sin IO, sin Drizzle, sin store y SIN ruta (P1: la corrección
// existe como función + log auditable, el endpoint queda fuera de corte).
// Corrige el medio de una venta con documento vinculado, nunca UPDATE sobre
// la venta (misma disciplina que C7): la corrección es un registro nuevo con
// antes/después + motivo obligatorio + actor.
// Idempotency-Key: retry => 409 con la original (E3).
// TV7: el documento de corrección lleva la leyenda no fiscal.

import type { Medio } from "../../lib/validation.js";
import { LEYENDA_NO_FISCAL } from "./vender_mostrador.js";

export const MEDIOS_CORREGIBLES: ReadonlyArray<Medio> = ["Efectivo", "Debito", "Mercado Pago", "QR", "Transferencia"];

export interface CorreccionMedio {
  readonly id: string;
  readonly saleId: string;
  readonly medioOriginal: Medio;
  readonly medioNuevo: Medio;
  readonly motivo: string;
  readonly actor: string;
  readonly leyenda: typeof LEYENDA_NO_FISCAL;
}

export interface AuditoriaCorreccion {
  readonly accion: "correccion_medio";
  readonly correccionId: string;
  readonly saleId: string;
  readonly antes: Medio;
  readonly despues: Medio;
  readonly actor: string;
  readonly motivo: string;
}

export interface CorreccionOk {
  readonly status: 201;
  readonly correccion: CorreccionMedio;
  readonly auditoria: AuditoriaCorreccion;
}

export type CorreccionResult =
  | CorreccionOk
  | { readonly status: 409; readonly error: string; readonly original?: CorreccionOk }
  | { readonly status: 422; readonly error: string };

function esMedio(m: string): m is Medio {
  return (MEDIOS_CORREGIBLES as ReadonlyArray<string>).includes(m);
}

export function corregir_medio(input: {
  readonly idempotencyKey: string;
  readonly saleId: string;
  readonly medioOriginal: string;
  readonly medioNuevo: string;
  readonly motivo: string;
  readonly actor: string;
  readonly vistos: ReadonlyMap<string, CorreccionOk>;
}): CorreccionResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { status: 409, error: "idempotency-key repetida", original: visto };
  if (!input.idempotencyKey || !input.saleId) return { status: 422, error: "correccion invalida" };
  if (!input.actor) return { status: 422, error: "actor requerido" };
  if (!input.motivo.trim() || input.motivo.length > 280) {
    return { status: 422, error: "motivo requerido (max 280)" };
  }
  if (!esMedio(input.medioOriginal) || !esMedio(input.medioNuevo)) {
    return { status: 422, error: "medio invalido" };
  }
  if (input.medioOriginal === input.medioNuevo) {
    return { status: 422, error: "el medio nuevo debe diferir del original" };
  }
  const correccion: CorreccionMedio = Object.freeze({
    id: `corr-${input.idempotencyKey}`,
    saleId: input.saleId,
    medioOriginal: input.medioOriginal,
    medioNuevo: input.medioNuevo,
    motivo: input.motivo,
    actor: input.actor,
    leyenda: LEYENDA_NO_FISCAL,
  });
  const auditoria: AuditoriaCorreccion = Object.freeze({
    accion: "correccion_medio" as const,
    correccionId: correccion.id,
    saleId: input.saleId,
    antes: input.medioOriginal,
    despues: input.medioNuevo,
    actor: input.actor,
    motivo: input.motivo,
  });
  return { status: 201, correccion, auditoria };
}
