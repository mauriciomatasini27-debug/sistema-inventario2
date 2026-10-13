import { HlcClock, newOpId } from "../lib/outbox.js";
import { bd, bdLista, tocar, transact } from "./db.js";
import type { DeviceSeq, EfectoLocal, Hlc, IdDef, OpId, OpLocal } from "./types.js";

// Cola idempotente por PK op_id. Doble-run y crash-safe:
// encolar y confirmar son no-op si op_id ya existe con mismo efecto.
// marcarEnviado solo transiciona pendiente->enviado, nunca borra, así un
// crash entre push-201 y confirm local se resuelve con re-push (server
// devuelve 200 mismo op_id, per E2 ADR-0003).
//
// Backing actual: mapas en memoria tras transact() serializado (misma firma
// que tendrá SQLite-WASM+OPFS). Desvío del sketch anotado: el sketch no
// guardaba deviceCode por op; se guarda en índice interno sin exponerlo en
// OpLocal para no agrandar la API pública.

const ops = new Map<OpId, OpLocal>();
const opDevice = new Map<OpId, string>();
const defs = new Map<OpId, IdDef>();
const lastSeq = new Map<string, number>();
const clock = new HlcClock();

const DEFAULT_DEVICE = "caja-01";

type SqlParam = string | number | null;

/** Escribe al diario SQLite si hay backend abierto. Nunca lanza: la memoria manda. */
function diario(sql: string, params: SqlParam[]): void {
  if (!bdLista()) return;
  try {
    const d = bd();
    const stmt = d.prepare(sql);
    try {
      stmt.run(params as Array<string | number | Uint8Array | null>);
    } finally {
      stmt.free();
    }
    tocar();
  } catch {
    // SQLite caído: la memoria sigue siendo la fuente.
  }
}

function toDeviceSeq(n: number): DeviceSeq {
  return n as DeviceSeq;
}

/** Encola un efecto local y asigna op_id/seq/hlc. Idempotente por op_id. */
export async function encolar(
  efecto: EfectoLocal,
  deviceCode: string = DEFAULT_DEVICE,
  opIdExistente?: OpId,
): Promise<OpLocal> {
  return transact(() => {
    if (opIdExistente) {
      const prev = ops.get(opIdExistente);
      // Mismo op_id + mismo efecto => no-op, devuelve original (como 200 server).
      if (prev && prev.efecto.kind === efecto.kind && prev.efecto.resumen === efecto.resumen) {
        return prev;
      }
    }
    const seq = (lastSeq.get(deviceCode) ?? 0) + 1;
    const op: OpLocal = {
      opId: (opIdExistente ?? newOpId()) as OpId,
      seq: toDeviceSeq(seq),
      hlc: clock.next() as Hlc,
      kind: efecto.kind,
      efecto,
      estado: "pendiente",
      intentos: 0,
      proximoReintentoAt: null,
    };
    // Si el op_id ya existía con distinto efecto, se conserva el primero
    // (gana el primero, como E2 server 409 con original).
    if (!ops.has(op.opId)) {
      ops.set(op.opId, op);
      opDevice.set(op.opId, deviceCode);
      lastSeq.set(deviceCode, seq);
    }
    const final = ops.get(op.opId) as OpLocal;
    // Diario durable: INSERT OR IGNORE espeja "gana el primero".
    diario(
      "INSERT OR IGNORE INTO journal_outbox(op_id,device,seq,hlc,kind,resumen,estado,intentos) VALUES (?,?,?,?,?,?,?,?)",
      [final.opId, deviceCode, final.seq, final.hlc, final.kind, final.efecto.resumen, final.estado, final.intentos],
    );
    return final;
  });
}

/** Transiciona pendiente->enviado sin borrar. Idempotente. */
export async function marcarEnviado(op: OpId): Promise<void> {
  await transact(() => {
    const prev = ops.get(op);
    if (!prev) return;
    if (prev.estado === "pendiente") {
      ops.set(op, { ...prev, estado: "enviado", intentos: prev.intentos + 1 });
    }
    const cur = ops.get(op) as OpLocal;
    diario("UPDATE journal_outbox SET estado=?,intentos=? WHERE op_id=?", [cur.estado, cur.intentos, op]);
  });
}

/** Confirma con id definitivo del servidor. Idempotente por op_id. */
export async function confirmar(op: OpId, def: IdDef): Promise<void> {
  await transact(() => {
    const prev = ops.get(op);
    if (!prev) return;
    if (!defs.has(op)) defs.set(op, def);
    if (prev.estado !== "confirmado") {
      ops.set(op, { ...prev, estado: "confirmado" });
    }
    // def gana el primero también en el diario (COALESCE).
    diario("UPDATE journal_outbox SET estado='confirmado',def=COALESCE(def,?) WHERE op_id=?", [defs.get(op) as string, op]);
  });
}

/** Definitivo guardado para un op, si ya se confirmó. */
export async function definitivoDe(op: OpId): Promise<IdDef | null> {
  return transact(() => defs.get(op) ?? null);
}

/** Pendientes (pendiente+enviado) en orden seq para push secuencial (evita 422). */
export async function pendientes(limite: number): Promise<OpLocal[]> {
  return transact(() =>
    [...ops.values()]
      .filter((o) => o.estado !== "confirmado")
      .sort((a, b) => a.seq - b.seq)
      .slice(0, Math.max(0, limite)),
  );
}

/** Repara gaps de seq tras crash: reconstruye lastSeq desde ops guardadas. */
export async function repararSeq(): Promise<void> {
  await transact(() => {
    lastSeq.clear();
    for (const [opId, op] of ops) {
      const dev = opDevice.get(opId) ?? DEFAULT_DEVICE;
      if (op.seq > (lastSeq.get(dev) ?? 0)) lastSeq.set(dev, op.seq);
    }
  });
}

/** Solo tests: pierde contadores volátiles (seq/clock) pero conserva ops. */
export async function simularCrashVolatil(): Promise<void> {
  await transact(() => {
    lastSeq.clear();
  });
}

/** Solo tests: vacía la cola. */
export async function resetOutbox(): Promise<void> {
  await transact(() => {
    ops.clear();
    opDevice.clear();
    defs.clear();
    lastSeq.clear();
    if (bdLista()) {
      try {
        bd().exec("DELETE FROM journal_outbox");
        tocar();
      } catch {
        // Memoria ya limpia: alcanza.
      }
    }
  });
}

/** Solo tests: pierde la memoria sin tocar SQLite (simula restart). */
export async function descartarMemoriaOutbox(): Promise<void> {
  await transact(() => {
    ops.clear();
    opDevice.clear();
    defs.clear();
    lastSeq.clear();
  });
}

/** Reconstruye la memoria desde el diario (boot tras restart). Solo suma faltantes. */
export async function hidratarOutbox(): Promise<void> {
  if (!bdLista()) return;
  await transact(() => {
    let rows: Array<{ [k: string]: string | number | Uint8Array | null }>;
    try {
      const out = bd().exec("SELECT op_id,device,seq,hlc,kind,resumen,estado,intentos,def FROM journal_outbox ORDER BY seq");
      if (out.length === 0) return;
      const cols = out[0]!.columns;
      rows = out[0]!.values.map((v) => Object.fromEntries(v.map((c, i) => [cols[i] as string, c])) as { [k: string]: string | number | Uint8Array | null });
    } catch {
      return;
    }
    for (const r of rows) {
      const opId = String(r["op_id"]) as OpId;
      if (ops.has(opId)) continue;
      const kind = String(r["kind"]);
      if (kind !== "venta" && kind !== "mov_caja" && kind !== "foto") continue;
      const estado = String(r["estado"]);
      if (estado !== "pendiente" && estado !== "enviado" && estado !== "confirmado") continue;
      ops.set(opId, {
        opId,
        seq: Number(r["seq"]) as DeviceSeq,
        hlc: String(r["hlc"]) as Hlc,
        kind,
        efecto: { kind, resumen: String(r["resumen"]) },
        estado,
        intentos: Number(r["intentos"]),
        proximoReintentoAt: null,
      });
      opDevice.set(opId, String(r["device"]));
      if (r["def"] !== null && r["def"] !== undefined) defs.set(opId, String(r["def"]) as IdDef);
    }
  });
}
