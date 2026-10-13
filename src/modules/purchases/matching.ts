// LANE E — Matching determinista borrador↔purchase_orders FP1-FP12.
// Sin IA: mismo proveedor (CUIT normalizado) + monto dentro de tolerancia
// (defecto 1%, matemática exacta con enteros) + orden abierta. Cada OC
// evaluada deja una entrada de match_log auditable (coincide + motivo).
// Núcleo puro: sin IO, sin reloj propio salvo ahoraIso para el log.

import { normalizarCuit } from "./proveedores.js";

export interface OrdenMatchable {
  readonly id: string;
  readonly supplierCuit: string;
  readonly estado: "abierta" | "cerrada";
  readonly totalCentavos: bigint;
}

export interface CandidatoMatch {
  readonly orderId: string;
  readonly diferenciaCentavos: bigint;
}

export interface MatchLogEntry {
  readonly id: string;
  readonly draftId: string;
  readonly orderId: string;
  readonly coincide: boolean;
  readonly motivo: string;
  readonly creadoEn: string;
}

export interface MatchearInput {
  readonly draftId: string;
  readonly cuit: string;
  readonly totalCentavos: bigint;
  readonly ordenes: ReadonlyArray<OrdenMatchable>;
  readonly ahoraIso: string;
  readonly toleranciaPct?: number | undefined;
}

export interface MatchearResult {
  readonly candidatos: ReadonlyArray<CandidatoMatch>;
  readonly log: ReadonlyArray<MatchLogEntry>;
}

// Tolerancia exacta: diff*10000 <= base*tolBp (tolBp = pct*100). Base 0 solo
// matchea total 0.
export function dentroTolerancia(a: bigint, b: bigint, toleranciaPct = 1): boolean {
  if (!Number.isFinite(toleranciaPct) || toleranciaPct < 0 || toleranciaPct > 100) {
    throw new Error("tolerancia 0-100");
  }
  const diff = a >= b ? a - b : b - a;
  const base = b < 0n ? -b : b;
  if (base === 0n) return diff === 0n;
  const tolBp = Math.round(toleranciaPct * 100);
  return diff * 10_000n <= base * BigInt(tolBp);
}

export function matchearBorrador(input: MatchearInput): MatchearResult {
  const tol = input.toleranciaPct ?? 1;
  const cuit = normalizarCuit(input.cuit);
  const candidatos: CandidatoMatch[] = [];
  const log: MatchLogEntry[] = [];
  for (const oc of input.ordenes) {
    const base = `${input.draftId}:${oc.id}`;
    if (normalizarCuit(oc.supplierCuit) !== cuit) {
      log.push(
        Object.freeze({
          id: `ml-${base}`,
          draftId: input.draftId,
          orderId: oc.id,
          coincide: false,
          motivo: "proveedor distinto",
          creadoEn: input.ahoraIso,
        }),
      );
      continue;
    }
    if (oc.estado !== "abierta") {
      log.push(
        Object.freeze({
          id: `ml-${base}`,
          draftId: input.draftId,
          orderId: oc.id,
          coincide: false,
          motivo: "orden cerrada",
          creadoEn: input.ahoraIso,
        }),
      );
      continue;
    }
    if (!dentroTolerancia(input.totalCentavos, oc.totalCentavos, tol)) {
      log.push(
        Object.freeze({
          id: `ml-${base}`,
          draftId: input.draftId,
          orderId: oc.id,
          coincide: false,
          motivo: `monto fuera de tolerancia ${tol}%`,
          creadoEn: input.ahoraIso,
        }),
      );
      continue;
    }
    const diferenciaCentavos =
      input.totalCentavos >= oc.totalCentavos
        ? input.totalCentavos - oc.totalCentavos
        : oc.totalCentavos - input.totalCentavos;
    candidatos.push(Object.freeze({ orderId: oc.id, diferenciaCentavos }));
    log.push(
      Object.freeze({
        id: `ml-${base}`,
        draftId: input.draftId,
        orderId: oc.id,
        coincide: true,
        motivo: "proveedor + monto dentro de tolerancia",
        creadoEn: input.ahoraIso,
      }),
    );
  }
  candidatos.sort((x, y) => (x.diferenciaCentavos < y.diferenciaCentavos ? -1 : 1));
  return { candidatos: Object.freeze(candidatos), log: Object.freeze(log) };
}

// ---------------------------------------------------------------------------
// Vinculación automática al confirmar el borrador (matching auto completo).
// Solo el match EXACTO (misma CUIT + diferencia 0, sin tolerancia) vincula
// solo: con 0 o N>1 exactos no se toca ninguna OC y el comerciante elige
// a mano (el POST /match manual sigue para la tolerancia del 1%).
// Puro: el llamante persiste el log y cierra la OC vinculada.
// ---------------------------------------------------------------------------

export interface VincularAutoInput {
  readonly draftId: string;
  readonly cuit: string;
  readonly totalCentavos: bigint;
  readonly ordenes: ReadonlyArray<OrdenMatchable>;
  readonly ahoraIso: string;
  readonly toleranciaPct?: number | undefined;
}

export type VincularAutoResult =
  | { readonly vinculado: { readonly orderId: string }; readonly motivo: string; readonly log: ReadonlyArray<MatchLogEntry> }
  | { readonly vinculado: null; readonly motivo: string; readonly log: ReadonlyArray<MatchLogEntry> };

export function vincular_auto(input: VincularAutoInput): VincularAutoResult {
  const r = matchearBorrador({
    draftId: input.draftId,
    cuit: input.cuit,
    totalCentavos: input.totalCentavos,
    ordenes: input.ordenes,
    ahoraIso: input.ahoraIso,
    ...(input.toleranciaPct !== undefined ? { toleranciaPct: input.toleranciaPct } : {}),
  });
  const exactos = r.candidatos.filter((c) => c.diferenciaCentavos === 0n);
  if (exactos.length === 1 && exactos[0] !== undefined) {
    return {
      vinculado: { orderId: exactos[0].orderId },
      motivo: "auto-exacto: mismo proveedor + monto exacto",
      log: r.log,
    };
  }
  if (exactos.length > 1) {
    return { vinculado: null, motivo: `${exactos.length} matches exactos: elegir manual`, log: r.log };
  }
  if (r.candidatos.length > 0) {
    return {
      vinculado: null,
      motivo: `sin match exacto (${r.candidatos.length} en tolerancia): elegir manual`,
      log: r.log,
    };
  }
  return { vinculado: null, motivo: "sin orden candidata", log: r.log };
}
