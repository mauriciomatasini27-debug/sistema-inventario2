import type { Movimiento } from "./caja.js";
import { derivar_balance } from "./caja.js";

// C12 cierre de jornada (ADR-0004). Núcleo puro: recibe estado en memoria,
// la tx real Postgres con UNIQUE(fecha_jornada) vive en Drizzle.
// Dinero siempre bigint centavos; el cierre solo INSERTA, nunca UPDATE.

export type CloseType = "manual" | "automatica";

export interface CierreInput {
  idempotencyKey: string;
  fechaJornada: string;
  closeType: CloseType | string;
  movimientos: Movimiento[];
  ultimoMovimientoId: string | null;
  turnosEnDisputa: number;
  cierres: Map<string, CierreOk>;
}

export interface CierreOk {
  status: 201;
  cierre: {
    fechaJornada: string;
    closeType: CloseType;
    totalCentavos: bigint;
    ultimoMovimientoId: string | null;
  };
}

export type CierreResult =
  | CierreOk
  | { status: 409; error: string; original?: CierreOk }
  | { status: 422; error: string };

// Por qué Intl y no UTC: fecha_jornada es America/Argentina (C2/C12); un
// cierre a las 23:30 hora local no pertenece al día UTC siguiente.
export function fecha_jornada_ar(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

// Por qué regex y no Date.parse: fecha_jornada es solo calendario YYYY-MM-DD,
// sin hora ni zona; el formato se valida acá en el borde del dominio.
export function es_fecha_jornada_valida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// C12 + E5: un cierre por jornada; con turno en disputa el Dueño resuelve
// primero (ver turnos.ts). close_type CHECK (manual/automatica) se valida
// acá y en migración.
export function cerrar_jornada(input: CierreInput): CierreResult {
  const visto = input.cierres.get(input.idempotencyKey);
  if (visto) return { status: 409, error: "idempotency-key repetida", original: visto };
  if (input.cierres.has(input.fechaJornada)) {
    return { status: 409, error: "jornada ya cerrada" };
  }
  if (input.closeType !== "manual" && input.closeType !== "automatica") {
    return { status: 422, error: "close_type invalido" };
  }
  if (!es_fecha_jornada_valida(input.fechaJornada)) {
    return { status: 422, error: "fecha_jornada invalida" };
  }
  if (input.turnosEnDisputa > 0) {
    return { status: 422, error: "cierre con turno en disputa" };
  }
  const balance = derivar_balance(input.movimientos);
  const ok: CierreOk = {
    status: 201,
    cierre: {
      fechaJornada: input.fechaJornada,
      closeType: input.closeType,
      totalCentavos: balance.total,
      ultimoMovimientoId: input.ultimoMovimientoId,
    },
  };
  input.cierres.set(input.idempotencyKey, ok);
  input.cierres.set(input.fechaJornada, ok);
  return ok;
}
