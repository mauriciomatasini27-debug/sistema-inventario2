import type { Rol } from "./caja.js";

// C17 turnos (ADR-0004). Conteo a ciegas vs esperado, tolerancia ±$500,
// diferencia_turno + resolución Dueño, drops y conteo sorpresa.
// Núcleo puro en memoria; la persistencia vive en shift_handovers,
// handover_counts y cash_drawer_drops (schema-caja.ts).

// Por qué bigint: $500 = 500_00 centavos exactos, sin floats (ADR-0004).
export const TOLERANCIA_CENTAVOS = 50000n;

export type EstadoTurno = "pendiente" | "conciliado" | "en_disputa" | "resuelto";

export interface Turno {
  id: string;
  fechaJornada: string;
  turno: string;
  entregadoPor: string;
  recibidoPor?: string | undefined;
  esperadoCentavos: bigint;
  contadoCentavos?: bigint | undefined;
  diferenciaCentavos?: bigint | undefined;
  estado: EstadoTurno;
  resolucionNota?: string | undefined;
  resueltoPor?: string | undefined;
}

export interface ConciliarInput {
  idempotencyKey: string;
  turnoId: string;
  contadoCentavos: bigint;
  conteosPorMedio: Array<{ medio: string; montoCentavos: bigint }>;
  turnos: Map<string, Turno>;
  vistos: Map<string, ConciliarOk>;
}

export interface ConciliarOk {
  status: 201;
  turno: Turno;
}

export type ConciliarResult =
  | ConciliarOk
  | { status: 404; error: string }
  | { status: 409; error: string; original?: ConciliarOk }
  | { status: 422; error: string };

// Por qué valor absoluto con ternario y no Math.abs: Math.abs no acepta
// bigint; la tolerancia compara centavos exactos.
function absBigint(v: bigint): bigint {
  return v < 0n ? -v : v;
}

// C17: el que cuenta no ve el esperado hasta conciliar; si |contado -
// esperado| supera ±$500 nace diferencia_turno en disputa que solo el
// Dueño puede resolver. Dentro de tolerancia concilia directo.
export function conciliar_turno(input: ConciliarInput): ConciliarResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { status: 409, error: "idempotency-key repetida", original: visto };
  const turno = input.turnos.get(input.turnoId);
  if (!turno) return { status: 404, error: "turno inexistente" };
  if (turno.estado !== "pendiente") {
    return { status: 409, error: "turno ya conciliado" };
  }
  if (input.contadoCentavos < 0n) return { status: 422, error: "conteo negativo" };
  let sumaMedios = 0n;
  for (const c of input.conteosPorMedio) {
    if (c.montoCentavos < 0n) return { status: 422, error: "conteo por medio negativo" };
    sumaMedios += c.montoCentavos;
  }
  if (sumaMedios !== input.contadoCentavos) {
    return { status: 422, error: "conteo no cuadra con desglose por medio" };
  }
  const diferencia = input.contadoCentavos - turno.esperadoCentavos;
  const conciliado: Turno = {
    ...turno,
    contadoCentavos: input.contadoCentavos,
    diferenciaCentavos: diferencia,
    estado: absBigint(diferencia) <= TOLERANCIA_CENTAVOS ? "conciliado" : "en_disputa",
  };
  input.turnos.set(turno.id, conciliado);
  const ok: ConciliarOk = { status: 201, turno: conciliado };
  input.vistos.set(input.idempotencyKey, ok);
  return ok;
}

export interface ResolverInput {
  turnoId: string;
  nota: string;
  rol: Rol;
  resueltoPor: string;
  turnos: Map<string, Turno>;
}

export type ResolverResult =
  | { status: 200; turno: Turno }
  | { status: 403; error: string }
  | { status: 404; error: string }
  | { status: 422; error: string };

// Por qué 403 y no 422: es permiso por rol (C15/C16/C17), igual que
// retiro_dueno y sueldos en caja.ts; solo el Dueño cierra disputas.
export function resolver_disputa(input: ResolverInput): ResolverResult {
  if (input.rol !== "dueno") return { status: 403, error: "resolucion solo dueno" };
  const turno = input.turnos.get(input.turnoId);
  if (!turno) return { status: 404, error: "turno inexistente" };
  if (turno.estado !== "en_disputa") return { status: 422, error: "turno sin disputa" };
  if (!input.nota) return { status: 422, error: "resolucion exige nota" };
  const resuelto: Turno = {
    ...turno,
    estado: "resuelto",
    resolucionNota: input.nota,
    resueltoPor: input.resueltoPor,
  };
  input.turnos.set(turno.id, resuelto);
  return { status: 200, turno: resuelto };
}

export interface Drop {
  id: string;
  fechaJornada: string;
  montoCentavos: bigint;
  motivo?: string | undefined;
  creadoPor: string;
  sorpresa: boolean;
}

export interface DropInput {
  idempotencyKey: string;
  fechaJornada: string;
  montoCentavos: bigint;
  motivo?: string | undefined;
  creadoPor: string;
  sorpresa: boolean;
  drops: Map<string, Drop>;
  vistos: Map<string, DropOk>;
}

export interface DropOk {
  status: 201;
  drop: Drop;
}

export type DropResult =
  | DropOk
  | { status: 409; error: string; original?: DropOk }
  | { status: 422; error: string };

// cash_drawer_drops: retiro parcial a caja fuerte durante el turno;
// sorpresa=true es el conteo no anunciado del Dueño.
export function registrar_drop(input: DropInput): DropResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { status: 409, error: "idempotency-key repetida", original: visto };
  if (input.montoCentavos <= 0n) return { status: 422, error: "monto debe ser positivo" };
  if (!input.creadoPor) return { status: 422, error: "creado_por requerido" };
  const drop: Drop = {
    id: input.idempotencyKey,
    fechaJornada: input.fechaJornada,
    montoCentavos: input.montoCentavos,
    creadoPor: input.creadoPor,
    sorpresa: input.sorpresa,
    ...(input.motivo !== undefined ? { motivo: input.motivo } : {}),
  };
  input.drops.set(drop.id, drop);
  const ok: DropOk = { status: 201, drop };
  input.vistos.set(input.idempotencyKey, ok);
  return ok;
}
