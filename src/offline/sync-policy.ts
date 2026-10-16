import { puedeOperarOffline } from "./grants.js";
import { esOperacionSoloOnline } from "./sensibles.js";
import type { AlcanceGrant, Cursor, Hlc, OfflineGrant, OpKind, OpLocal } from "./types.js";

// Núcleo puro sync (sin IO/fetch/db). Testeable sin SQLite ni red.
// La política vive acá; los adaptadores (sync-worker, local-repo) son finos.

export type SyncModulo = "inventory" | "sales" | "cash";

/** Mapeo total OpKind -> modulo wire. Único lugar que conoce el desalineo dominio/wire. */
export function mapKindASyncModulo(kind: OpKind): SyncModulo {
  switch (kind) {
    case "venta":
      return "sales";
    case "mov_caja":
      return "cash";
    case "foto":
      return "inventory";
    default: {
      const _exhaustivo: never = kind;
      throw new Error(`OpKind desconocido: ${String(_exhaustivo)}`);
    }
  }
}

/** Alcance de grant que exige cada kind para operar offline. */
export function alcanceDe(kind: OpKind): AlcanceGrant {
  switch (kind) {
    case "venta":
      return "venta";
    case "mov_caja":
      return "caja";
    case "foto":
      return "stock";
    default: {
      const _exhaustivo: never = kind;
      throw new Error(`OpKind desconocido: ${String(_exhaustivo)}`);
    }
  }
}

export type PushDecision = { ok: true } | { ok: false; motivo: "grant" | "dead-letter" | "backoff" };

/**
 * ¿Se puede pushear este op ahora? Puro.
 * - grant === null => push online sin gate (ok).
 * - grant presente pero inválido para el alcance => grant.
 * - proximoReintentoAt futuro => backoff.
 */
export function decidirPush(op: OpLocal, grant: OfflineGrant | null, ahora: Date = new Date()): PushDecision {
  if (op.estado === "confirmado") return { ok: false, motivo: "dead-letter" };
  // SYNC-S7: defensa en profundidad; encolar ya rechaza lo sensible, pero una
  // cola anterior nunca debe pushearlo.
  if (esOperacionSoloOnline(op.efecto.tipo)) return { ok: false, motivo: "grant" };
  if (op.proximoReintentoAt != null && op.proximoReintentoAt > ahora.getTime()) {
    return { ok: false, motivo: "backoff" };
  }
  if (grant !== null && grant !== undefined) {
    if (!puedeOperarOffline(grant, alcanceDe(op.kind), ahora)) {
      return { ok: false, motivo: "grant" };
    }
  }
  return { ok: true };
}

export type EfectoPush =
  | { accion: "confirmar"; def: string; hlc: string }
  | { accion: "conflicto-avanza"; hlc: string }
  | { accion: "dead-letter" }
  | { accion: "reintentar"; backoffMs: number };

/**
 * Reduce status HTTP de push a efecto. Puro.
 * 201/200 => confirmar. 409 distinto payload => avanza sin sobrescribir (E2).
 * 422 => dead-letter, nunca reintento ciego. 5xx/red => reintentar con backoff.
 */
export function reducirPushResult(
  op: OpLocal,
  status: 200 | 201 | 409 | 422 | 500,
  body: unknown,
  rand: () => number = Math.random,
): EfectoPush {
  void body;
  if (status === 201 || status === 200) {
    const def = typeof body === "object" && body !== null && "id_mapeado" in body
      ? String((body as Record<string, unknown>)["id_mapeado"])
      : `srv-${op.opId.slice(0, 8)}`;
    return { accion: "confirmar", def, hlc: op.hlc };
  }
  if (status === 409) return { accion: "conflicto-avanza", hlc: op.hlc };
  if (status === 422) return { accion: "dead-letter" };
  return { accion: "reintentar", backoffMs: calcularBackoff(op.intentos, rand) };
}

/** Backoff exponencial con jitter ±20%. Puro, rand inyectable para tests. */
export function calcularBackoff(intentos: number, rand: () => number = Math.random): number {
  const base = Math.min(30_000, 500 * 2 ** Math.max(0, intentos));
  const jitter = 0.8 + rand() * 0.4;
  return Math.round(base * jitter);
}

/** Cursor = max(hlc) monótono. Único constructor de Cursor. Compara numéricamente ms:counter. */
export function avanzarCursor(actual: Cursor | null, hlc: Hlc | string): Cursor {
  if (actual == null) return hlc as Cursor;
  const parse = (s: string): [number, number] => {
    const i = s.indexOf(":");
    if (i < 0) return [Number(s), 0];
    return [Number(s.slice(0, i)), Number(s.slice(i + 1))];
  };
  const [aMs, aCt] = parse(String(actual));
  const [hMs, hCt] = parse(String(hlc));
  if (hMs > aMs || (hMs === aMs && hCt > aCt)) return hlc as Cursor;
  return actual;
}
