// LANE F — Cuentas de servicio CS8 (Nivel 2, Compras y gastos).
//
// Núcleo puro: sin IO, sin Drizzle, sin reloj propio. El adaptador (ruta)
// lee snapshots y aplica el efecto en una sola tx. Mismo patrón que
// credit/clientes.ts: validar + normalizar + anti-duplicados, todo o nada.
//
// CS8: cuenta = tipo de servicio + proveedor + número de cuenta/cliente.
// Se crea al confirmar la primera factura (el adaptador la sugiere junto
// con la factura). Solo el Dueño edita alias/medio/débito y desactiva;
// sus facturas se conservan (desactivar no borra nada).
//
// Nota de alcance: el PRD CS8.3 pide no copiar domicilio/titular a la base
// (quedan en el comprobante). El sliceHyper exige titular identificatorio
// mínimo, así que se guarda SOLO titular (nombre del titular del servicio,
// sin domicilio ni documentos). Nada más de datos personales.

import { z } from "zod";

// CS2.1: tipos predefinidos. "otro" cubre servicio personalizado P1
// (ej. alquiler que llega por email y el Dueño agrega).
export const SERVICIOS = ["luz", "gas", "agua", "internet", "telefono", "tasas", "arca", "otro"] as const;
export type Servicio = (typeof SERVICIOS)[number];

export const MEDIOS_HABITUALES = ["Efectivo", "Debito", "Mercado Pago", "QR", "Transferencia"] as const;
export type MedioHabitual = (typeof MEDIOS_HABITUALES)[number];

export const PROVEEDOR_MAX = 80;
export const TITULAR_MAX = 80;
export const NUMERO_CUENTA_MAX = 40;
export const ALIAS_MAX = 80;

export interface CuentaInput {
  readonly servicio: string;
  readonly proveedor: string;
  readonly titular: string;
  readonly numeroCuenta?: string;
  readonly alias?: string;
  readonly vencimientoTipicoDia?: number;
  readonly emailOrigen?: string;
  readonly medioHabitual?: string;
  readonly debitoAutomatico?: boolean;
}

export interface CuentaExistente {
  readonly servicio: string;
  readonly proveedor: string;
  readonly titular: string;
  readonly numeroCuenta: string | null;
}

export interface CuentaServicio {
  readonly id: string;
  readonly servicio: Servicio;
  readonly proveedor: string;
  readonly titular: string;
  readonly numeroCuenta: string | null;
  readonly alias: string | null;
  readonly vencimientoTipicoDia: number | null;
  readonly emailOrigen: string | null;
  readonly medioHabitual: MedioHabitual | null;
  readonly debitoAutomatico: boolean;
  readonly activa: boolean;
}

// ---------------------------------------------------------------------------
// Zod de borde (mismas convenciones que src/lib/validation.ts: listas
// cerradas; el dominio convierte y normaliza).
// ---------------------------------------------------------------------------

export const servicioSchema = z.enum(SERVICIOS);

export const cuentaSchema = z.object({
  servicio: servicioSchema,
  proveedor: z.string().min(2).max(PROVEEDOR_MAX),
  titular: z.string().min(2).max(TITULAR_MAX),
  numero_cuenta: z.string().min(1).max(NUMERO_CUENTA_MAX).optional(),
  alias: z.string().min(1).max(ALIAS_MAX).optional(),
  vencimiento_tipico_dia: z.number().int().min(1).max(31).optional(),
  email_origen: z.string().email("email inválido").max(320).optional(),
  medio_habitual: z.enum(MEDIOS_HABITUALES).optional(),
  debito_automatico: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Normalización (pura, reutilizable en cliente offline y servidor, igual
// que normalizar_nombre en credit/clientes.ts: el anti-duplicado debe dar
// igual en ambos lados).
// ---------------------------------------------------------------------------

export function normalizar_proveedor(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizar_titular(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

// Número de cuenta/cliente/partida: mayúsculas sin espacios ni guiones
// ("12-345" y "12 345" matchean igual).
export function normalizar_numero_cuenta(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s\-.]+/g, "");
}

export function es_servicio(s: string): s is Servicio {
  return (SERVICIOS as ReadonlyArray<string>).includes(s);
}

function es_medio_habitual(s: string): s is MedioHabitual {
  return (MEDIOS_HABITUALES as ReadonlyArray<string>).includes(s);
}

// Pura y reutilizable por la ruta (además del Zod del borde).
export function validar_cuenta(input: CuentaInput): string[] {
  const errores: string[] = [];
  if (!es_servicio(input.servicio.trim().toLowerCase())) {
    errores.push(`servicio fuera de lista (${SERVICIOS.join("|")})`);
  }
  const proveedor = input.proveedor.trim();
  if (proveedor.length < 2) errores.push("proveedor requerido");
  else if (proveedor.length > PROVEEDOR_MAX) errores.push(`proveedor maximo ${PROVEEDOR_MAX}`);
  const titular = input.titular.trim();
  if (titular.length < 2) errores.push("titular requerido");
  else if (titular.length > TITULAR_MAX) errores.push(`titular maximo ${TITULAR_MAX}`);
  if (input.numeroCuenta !== undefined) {
    const n = input.numeroCuenta.trim();
    if (!n) errores.push("numero de cuenta invalido");
    else if (n.length > NUMERO_CUENTA_MAX) errores.push(`numero de cuenta maximo ${NUMERO_CUENTA_MAX}`);
  }
  if (input.alias !== undefined && (input.alias.trim().length === 0 || input.alias.length > ALIAS_MAX)) {
    errores.push(`alias maximo ${ALIAS_MAX}`);
  }
  if (
    input.vencimientoTipicoDia !== undefined &&
    (!Number.isInteger(input.vencimientoTipicoDia) || input.vencimientoTipicoDia < 1 || input.vencimientoTipicoDia > 31)
  ) {
    errores.push("vencimiento tipico 1 a 31");
  }
  if (input.emailOrigen !== undefined) {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.emailOrigen.trim());
    if (!emailOk) errores.push("email origen invalido");
  }
  if (input.medioHabitual !== undefined && !es_medio_habitual(input.medioHabitual)) {
    errores.push("medio habitual fuera de lista");
  }
  return errores;
}

// Anti-duplicados CS8/CS9.3: con número de cuenta, misma
// servicio+proveedor+numero; sin número, misma servicio+proveedor+titular.
// OR y no AND: con una sola identidad repetida ya es duplicada.
export function es_cuenta_duplicada(
  candidato: { readonly servicio: string; readonly proveedor: string; readonly titular: string; readonly numeroCuenta: string | null },
  existentes: ReadonlyArray<CuentaExistente>,
): boolean {
  const servicio = candidato.servicio.trim().toLowerCase();
  const proveedor = normalizar_proveedor(candidato.proveedor);
  const titular = normalizar_titular(candidato.titular);
  const numero = candidato.numeroCuenta === null ? null : normalizar_numero_cuenta(candidato.numeroCuenta);
  for (const e of existentes) {
    if (e.servicio.trim().toLowerCase() !== servicio) continue;
    if (normalizar_proveedor(e.proveedor) !== proveedor) continue;
    const eNumero = e.numeroCuenta === null ? null : normalizar_numero_cuenta(e.numeroCuenta);
    if (numero !== null && eNumero !== null) {
      if (numero === eNumero) return true;
    } else if (normalizar_titular(e.titular) === titular) {
      return true;
    }
  }
  return false;
}

export type FalloCuenta =
  | { readonly ok: false; readonly codigo: "CUENTA_INVALIDA"; readonly status: 422; readonly error: string }
  | { readonly ok: false; readonly codigo: "DUPLICADA"; readonly status: 409; readonly error: string };

export type CrearCuentaResult = { readonly ok: true; readonly cuenta: CuentaServicio } | FalloCuenta;

export function crear_cuenta(
  input: CuentaInput,
  existentes: ReadonlyArray<CuentaExistente>,
  opts?: { readonly id?: string },
): CrearCuentaResult {
  const errores = validar_cuenta(input);
  if (errores.length > 0) {
    const primero = errores[0] ?? "cuenta invalida";
    return { ok: false, codigo: "CUENTA_INVALIDA", status: 422, error: primero };
  }
  const servicio = input.servicio.trim().toLowerCase() as Servicio;
  const numeroCuenta =
    input.numeroCuenta === undefined || input.numeroCuenta.trim() === ""
      ? null
      : normalizar_numero_cuenta(input.numeroCuenta);
  if (
    es_cuenta_duplicada(
      { servicio, proveedor: input.proveedor, titular: input.titular, numeroCuenta },
      existentes,
    )
  ) {
    return { ok: false, codigo: "DUPLICADA", status: 409, error: "cuenta de servicio duplicada" };
  }
  const medio =
    input.medioHabitual !== undefined && es_medio_habitual(input.medioHabitual) ? input.medioHabitual : null;
  return {
    ok: true,
    cuenta: Object.freeze({
      id: opts?.id ?? crypto.randomUUID(),
      servicio,
      proveedor: input.proveedor.trim().replace(/\s+/g, " "),
      titular: input.titular.trim().replace(/\s+/g, " "),
      numeroCuenta,
      alias: input.alias === undefined || input.alias.trim() === "" ? null : input.alias.trim(),
      vencimientoTipicoDia: input.vencimientoTipicoDia ?? null,
      emailOrigen: input.emailOrigen === undefined ? null : input.emailOrigen.trim().toLowerCase(),
      medioHabitual: medio,
      debitoAutomatico: input.debitoAutomatico ?? false,
      activa: true,
    }),
  };
}

// CS8.4: desactivar conserva facturas (solo apaga la cuenta). Devuelve
// copia, no muta (mismo contrato que fijar_tope_plazo en Lane B).
export function desactivar_cuenta(cuenta: CuentaServicio): CuentaServicio {
  return Object.freeze({ ...cuenta, activa: false });
}
