import type { Medio } from "../../lib/validation.js";
import type { Movimiento, TipoMov } from "./caja.js";

export interface ReversionInput {
  idempotencyKey: string;
  revierteA: string;
  motivo?: string | undefined;
  actor: string;
  movimientos: Map<string, Movimiento & { id: string }>;
  reversiones: Map<string, string>;
  vistos: Map<string, ReversionOk>;
  auditoria: AuditEntry[];
}

export interface MovimientoRevertido extends Movimiento {
  id: string;
  revierteA: string;
}

export interface AuditoriaReversion {
  accion: "reversion";
  movimientoId: string;
  revierteA: string;
  actor: string;
  motivo?: string | undefined;
}

export interface AuditoriaUbicacion {
  accion: "ubicacion_asignada";
  sku: string;
  antes: string | null;
  despues: string;
  actor: string;
}

export interface AuditoriaConteo {
  accion: "conteo_confirmado";
  countId: string;
  contadoPor: string;
  confirmadoPor: string;
  motivo: string;
}

export interface AuditoriaConteoListo {
  accion: "conteo_listo_revisar";
  countId: string;
  contadoPor: string;
  confirmadoPor: string;
}

export interface AuditoriaPrecioCompletado {
  accion: "precio_completado";
  sku: string;
  antes: string;
  despues: string;
  actor: string;
}

export type AuditEntry =
  | AuditoriaReversion
  | AuditoriaUbicacion
  | AuditoriaConteo
  | AuditoriaConteoListo
  | AuditoriaPrecioCompletado;

export interface DetalleReversion {
  readonly motivo: string | null;
}

export interface ReversionOk {
  status: 201;
  movimiento: MovimientoRevertido;
  auditoria: AuditEntry;
}

export type ReversionResult =
  | ReversionOk
  | { status: 409; error: string; original?: ReversionOk }
  | { status: 422; error: string };

function tipoOpuesto(t: TipoMov): TipoMov {
  return t === "ingreso" ? "egreso" : "ingreso";
}

export function revertir_movimiento(input: ReversionInput): ReversionResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { status: 409, error: "idempotency-key repetida", original: visto };
  const original = input.movimientos.get(input.revierteA);
  if (!original) return { status: 422, error: "revierte_a inexistente" };
  if (input.reversiones.has(input.revierteA)) {
    return { status: 409, error: "movimiento ya revertido" };
  }
  if (!input.actor) return { status: 422, error: "actor requerido" };
  const compensatorio: MovimientoRevertido = {
    id: input.idempotencyKey,
    tipo: tipoOpuesto(original.tipo),
    metodo: original.metodo as Medio,
    monto_centavos: original.monto_centavos,
    origen: original.origen,
    revierteA: input.revierteA,
  };
  const entrada: AuditEntry = {
    accion: "reversion",
    movimientoId: compensatorio.id,
    revierteA: input.revierteA,
    actor: input.actor,
    ...(input.motivo !== undefined ? { motivo: input.motivo } : {}),
  };
  input.movimientos.set(compensatorio.id, compensatorio);
  input.reversiones.set(input.revierteA, compensatorio.id);
  input.auditoria.push(entrada);
  const ok: ReversionOk = { status: 201, movimiento: compensatorio, auditoria: entrada };
  input.vistos.set(input.idempotencyKey, ok);
  return ok;
}
