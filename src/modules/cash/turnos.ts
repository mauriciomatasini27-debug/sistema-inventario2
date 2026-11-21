import type { Rol } from "./caja.js";

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

function absBigint(v: bigint): bigint {
  return v < 0n ? -v : v;
}

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
