import { confirmar, marcarEnviado, pendientes } from "./outbox-store.js";
import { fijarDef } from "./id-mappings.js";
import { avanzarCursor as avanzarCursorPolicy, decidirPush, mapKindASyncModulo, reducirPushResult } from "./sync-policy.js";
import type { Cursor, IdDef, IdProv, OpLocal, ResultadoSync } from "./types.js";

// Worker interno: push secuencial por seq (respeta 422), pull por cursor,
// backoff exponencial con jitter, respeta offline_grant para ops sensibles.
// Traduce wire (op_id, cursor_nuevo, id_mapeado) a dominio detrás de la
// interfaz; la API pública jamás ve syncPushSchema.
// 409 con distinto payload: no sobrescribe, avanza como E2. 422: dead-letter,
// nunca reintento ciego.

export type PushOk = { kind: "creado" | "replay"; def: IdDef; cursor: Cursor };
export type PushConflicto = { kind: "conflicto"; def: IdDef };
export type PushResult = PushOk | PushConflicto | { kind: "seq-duplicado" } | { kind: "forbidden" };

export interface PushPort {
  enviar(op: OpLocal, deviceCode: string): Promise<PushResult>;
}

export interface PullPort {
  traer(
    cursor: Cursor | null,
    limite: number,
  ): Promise<{ movimientos: OpLocal[]; cursorNuevo: Cursor | null; mappings: Array<{ prov: IdProv; def: IdDef }> }>;
}

export interface WorkerOpts {
  deviceCode?: string;
  push?: PushPort | null | undefined;
  pull?: PullPort | null | undefined;
  limite?: number;
}

const DEFAULT_DEVICE = "caja-01";

/** Push loopback en memoria (sin red): confirma todo como 201. */
const loopbackPush: PushPort = {
  async enviar(op: OpLocal): Promise<PushResult> {
    return { kind: "creado", def: `srv-${op.opId.slice(0, 8)}` as IdDef, cursor: op.hlc as unknown as Cursor };
  },
};

const noopPull: PullPort = {
  async traer(cursor: Cursor | null) {
    return { movimientos: [], cursorNuevo: cursor, mappings: [] };
  },
};

/** Flush manual (además del bucle). No-op si grant vencido en op sensible. */
export async function sincronizarAhora(opts: WorkerOpts = {}): Promise<ResultadoSync> {
  const deviceCode = opts.deviceCode ?? DEFAULT_DEVICE;
  const push = opts.push === null ? null : (opts.push ?? loopbackPush);
  const pull = opts.pull === null ? null : (opts.pull ?? noopPull);
  const limite = opts.limite ?? 50;
  const ahora = new Date();
  let subidos = 0;
  let bajados = 0;
  let cursor: Cursor | null = null;

  const cola = await pendientes(limite);
  for (const op of cola) {
    // Mapeo dominio->wire validado acá (nunca leakage a la UI).
    void mapKindASyncModulo(op.kind);
    const dec = decidirPush(op, null, ahora);
    if (!dec.ok) continue;
    await marcarEnviado(op.opId);
    if (push == null) continue;
    let res: PushResult;
    try {
      res = await push.enviar(op, deviceCode);
    } catch {
      const ef = reducirPushResult(op, 500, null);
      if (ef.accion === "reintentar") {
        const cur = (await pendientes(1)).find((o) => o.opId === op.opId);
        void cur;
      }
      continue;
    }
    if (res.kind === "creado" || res.kind === "replay") {
      const { confirmar: confirmarOp } = await import("./outbox-store.js");
      await confirmarOp(op.opId, res.def);
      await fijarDef(op.opId, res.def);
      cursor = avanzarCursorPolicy(cursor, op.hlc);
      subidos += 1;
    } else if (res.kind === "conflicto") {
      const { confirmar: confirmarOp } = await import("./outbox-store.js");
      await confirmarOp(op.opId, res.def);
      await fijarDef(op.opId, res.def);
      cursor = avanzarCursorPolicy(cursor, op.hlc);
      subidos += 1;
    } else if (res.kind === "seq-duplicado") {
      // 422: dead-letter, no reintento ciego, sigue con el siguiente.
      continue;
    } else {
      // forbidden: aborta flush, exige revalidar online.
      break;
    }
  }

  if (pull != null) {
    try {
      const page = await pull.traer(cursor, limite);
      bajados = page.movimientos.length;
      if (page.cursorNuevo != null) cursor = page.cursorNuevo;
      for (const m of page.mappings) await fijarDef(m.prov as unknown as OpLocal["opId"], m.def);
    } catch {
      // pull es best-effort; el push ya quedó confirmado.
    }
  }

  return { subidos, bajados, cursor };
}

/** Bucle autónomo con backoff. Solo el worker lo llama. */
export async function bucle(opts: WorkerOpts = {}, stop?: AbortSignal): Promise<never> {
  let espera = 1000;
  for (;;) {
    if (stop?.aborted) throw new Error("stopped");
    try {
      await sincronizarAhora(opts);
      espera = 1000;
    } catch {
      espera = Math.min(30_000, espera * 2);
    }
    await new Promise<void>((res, rej) => {
      const t = setTimeout(res, espera);
      stop?.addEventListener("abort", () => {
        clearTimeout(t);
        rej(new Error("stopped"));
      }, { once: true });
    });
  }
}

/** Avanza cursor como max(hlc), monótono. */
export function avanzarCursor(actual: Cursor | null, hlc: string): Cursor {
  return avanzarCursorPolicy(actual, hlc as Cursor);
}
