// LANE B — Fiado FC1 (ficha cliente) + FC9 (topes/ajustes solo Dueño).
//
// Núcleo puro: sin IO, sin Drizzle, sin store. El adaptador (ruta) lee
// snapshots y aplica el efecto en una sola tx. Mismo patrón que caja.ts.
//
// FC1: ficha nombre + teléfono/DNI/notas 280c, anti-duplicados.
// Ley 25.326 mínima: solo se guardan estos campos (sin domicilio, sin
// email, sin scoring); notas acotadas a 280 caracteres y longitudes
// máximas en cada campo. El borrado/retención va en migración, no acá.
import { z } from "zod";
import type { Rol } from "../cash/caja.js";

export interface FichaInput {
  readonly nombre: string;
  readonly telefono?: string;
  readonly dni?: string;
  readonly notas?: string;
}

export interface ClienteExistente {
  readonly nombre: string;
  readonly telefono: string | null;
  readonly dni: string | null;
}

export interface Cliente {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly dni: string | null;
  readonly notas: string | null;
  readonly topeCentavos: bigint;
  readonly plazoDias: number;
}

export const NOMBRE_MAX = 80;
export const NOTAS_MAX = 280;
export const TELEFONO_MIN_DIGITOS = 6;
export const TELEFONO_MAX_DIGITOS = 20;
export const DNI_MAX = 20;
export const TOPE_DEFECTO = 0n;
export const PLAZO_DEFECTO_DIAS = 30;
export const PLAZO_MAX_DIAS = 365;

// Por qué normalizar acá y no en Zod: el anti-duplicado debe dar igual en
// cliente offline y servidor; misma función en ambos lados (C6-style).
export function normalizar_nombre(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

// Teléfono a solo dígitos: "+54 9 11..." y "119..." matchean igual.
export function normalizar_telefono(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function normalizar_dni(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

// Pura y reutilizable por la ruta (además del Zod del borde).
export function validar_ficha(input: FichaInput): string[] {
  const errores: string[] = [];
  const nombre = input.nombre.trim();
  if (!nombre) errores.push("nombre requerido");
  else if (nombre.length > NOMBRE_MAX) errores.push(`nombre maximo ${NOMBRE_MAX}`);
  if (input.telefono !== undefined) {
    const digitos = normalizar_telefono(input.telefono);
    if (!digitos) errores.push("telefono invalido");
    else if (digitos.length < TELEFONO_MIN_DIGITOS || digitos.length > TELEFONO_MAX_DIGITOS) {
      errores.push("telefono debe tener 6 a 20 digitos");
    }
  }
  if (input.dni !== undefined) {
    const dni = normalizar_dni(input.dni);
    if (!dni) errores.push("dni invalido");
    else if (dni.length > DNI_MAX) errores.push(`dni maximo ${DNI_MAX}`);
  }
  if (input.notas !== undefined && input.notas.length > NOTAS_MAX) {
    errores.push(`notas maximo ${NOTAS_MAX} caracteres`);
  }
  return errores;
}

// Anti-duplicados FC1: mismo nombre normalizado, o mismo teléfono, o mismo
// DNI. OR y no AND: con un solo identificador repetido ya es duplicado.
// P1-64: un solo recorrido. El boolean y el 409 salen de la misma ficha.
function primer_duplicado<E extends ClienteExistente>(
  candidato: { readonly nombre: string; readonly telefono: string | null; readonly dni: string | null },
  existentes: ReadonlyArray<E>,
): E | null {
  const nombre = normalizar_nombre(candidato.nombre);
  for (const e of existentes) {
    if (nombre !== "" && normalizar_nombre(e.nombre) === nombre) return e;
    if (candidato.telefono !== null && e.telefono === candidato.telefono) return e;
    if (candidato.dni !== null && e.dni === candidato.dni) return e;
  }
  return null;
}

export function es_duplicado(
  candidato: { readonly nombre: string; readonly telefono: string | null; readonly dni: string | null },
  existentes: ReadonlyArray<ClienteExistente>,
): boolean {
  return primer_duplicado(candidato, existentes) !== null;
}

export type FalloCliente<E extends ClienteExistente = ClienteExistente> =
  | { readonly ok: false; readonly codigo: "FICHA_INVALIDA"; readonly status: 422; readonly error: string }
  | { readonly ok: false; readonly codigo: "DUPLICADO"; readonly status: 409; readonly error: string; readonly existente: E }
  | { readonly ok: false; readonly codigo: "SOLO_DUENO"; readonly status: 403; readonly error: string };

export type CrearClienteResult<E extends ClienteExistente = ClienteExistente> =
  | { readonly ok: true; readonly cliente: Cliente }
  | FalloCliente<E>;

export function crear_cliente<E extends ClienteExistente>(
  input: FichaInput,
  existentes: ReadonlyArray<E>,
  opts?: { readonly id?: string; readonly topeCentavos?: bigint; readonly plazoDias?: number; readonly rol?: Rol },
): CrearClienteResult<E> {
  const errores = validar_ficha(input);
  if (errores.length > 0) {
    const primero = errores[0] ?? "ficha invalida";
    return { ok: false, codigo: "FICHA_INVALIDA", status: 422, error: primero };
  }
  // FC9: tope/plazo personalizados solo Dueño. Empleado crea con defecto.
  const rol = opts?.rol ?? "empleado";
  if ((opts?.topeCentavos !== undefined || opts?.plazoDias !== undefined) && rol !== "dueno") {
    return { ok: false, codigo: "SOLO_DUENO", status: 403, error: "tope y plazo solo dueno" };
  }
  const tope = opts?.topeCentavos ?? TOPE_DEFECTO;
  const plazo = opts?.plazoDias ?? PLAZO_DEFECTO_DIAS;
  const fallaTope = validar_tope_plazo(tope, plazo);
  if (fallaTope) return fallaTope;

  const telefono = input.telefono === undefined ? null : normalizar_telefono(input.telefono);
  const dni = input.dni === undefined ? null : normalizar_dni(input.dni);
  const notas = input.notas === undefined || input.notas === "" ? null : input.notas;
  const duplicado = primer_duplicado({ nombre: input.nombre, telefono, dni }, existentes);
  if (duplicado) {
    return { ok: false, codigo: "DUPLICADO", status: 409, error: "cliente duplicado", existente: duplicado };
  }
  return {
    ok: true,
    cliente: {
      id: opts?.id ?? crypto.randomUUID(),
      nombre: input.nombre.trim().replace(/\s+/g, " "),
      telefono,
      dni,
      notas,
      topeCentavos: tope,
      plazoDias: plazo,
    },
  };
}

function validar_tope_plazo(
  tope: bigint,
  plazo: number,
): Extract<FalloCliente, { codigo: "FICHA_INVALIDA" }> | null {
  if (tope < 0n) return { ok: false, codigo: "FICHA_INVALIDA", status: 422, error: "tope no puede ser negativo" };
  if (!Number.isInteger(plazo) || plazo < 0 || plazo > PLAZO_MAX_DIAS) {
    return { ok: false, codigo: "FICHA_INVALIDA", status: 422, error: `plazo 0 a ${PLAZO_MAX_DIAS} dias` };
  }
  return null;
}

export type FijarTopeResult = { readonly ok: true; readonly cliente: Cliente } | FalloCliente;

// FC9: tope + plazo solo Dueño (403 Empleado). Devuelve copia, no muta.
export function fijar_tope_plazo(
  cliente: Cliente,
  topeCentavos: bigint,
  plazoDias: number,
  rol: Rol,
): FijarTopeResult {
  if (rol !== "dueno") return { ok: false, codigo: "SOLO_DUENO", status: 403, error: "tope y plazo solo dueno" };
  const falla = validar_tope_plazo(topeCentavos, plazoDias);
  if (falla) return falla;
  return { ok: true, cliente: { ...cliente, topeCentavos, plazoDias } };
}

// P1-64: forma del POST. Los dígitos y el nombre vacío los dice validar_ficha.
export const altaRapidaClienteSchema = z
  .object({
    nombre: z.string().max(NOMBRE_MAX),
    telefono: z.string().max(40),
  })
  .strict();
