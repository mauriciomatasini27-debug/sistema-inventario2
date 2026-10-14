import { bd, bdLista, tocar, transact } from "./db.js";
import type { IdDef, IdProv, OpId } from "./types.js";

// Único dueño del mapa provisorio->definitivo. La UI nunca guarda el mapeo,
// solo llama a resolver(). Diario durable en journal_idmap (ver db.ts).

const provPorOp = new Map<OpId, IdProv>();
const defPorOp = new Map<OpId, IdDef>();
const opPorProv = new Map<IdProv, OpId>();

type SqlParam = string | number | null;

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

/** Registra provisorio para un op. */
export async function registrarProv(op: OpId, prov: IdProv): Promise<void> {
  await transact(() => {
    if (!provPorOp.has(op)) {
      provPorOp.set(op, prov);
      if (!opPorProv.has(prov)) opPorProv.set(prov, op);
    }
    diario("INSERT OR IGNORE INTO journal_idmap(op_id,prov) VALUES (?,?)", [op, provPorOp.get(op) as string]);
  });
}

/** Fija definitivo al confirmar push (201/200 mismo op_id). */
export async function fijarDef(op: OpId, def: IdDef): Promise<void> {
  await transact(() => {
    if (!defPorOp.has(op)) defPorOp.set(op, def);
    // Upsert: el def sobrevive aunque el prov nunca se journalizó (el prov
    // igual queda registrado para resolver). Gana el primero en ambos lados.
    diario(
      "INSERT INTO journal_idmap(op_id,prov,def) VALUES (?,?,?) ON CONFLICT(op_id) DO UPDATE SET def=COALESCE(journal_idmap.def,excluded.def)",
      [op, provPorOp.get(op) ?? String(op), defPorOp.get(op) as string],
    );
  });
}

/** Resuelve provisorio a definitivo si ya se confirmó, sino devuelve el mismo. */
export async function resolver(prov: IdProv): Promise<IdProv | IdDef> {
  return transact(() => {
    const op = opPorProv.get(prov);
    if (!op) return prov;
    return defPorOp.get(op) ?? prov;
  });
}

/** Resuelve un lote en una sola pasada. */
export async function resolverLote(provs: readonly IdProv[]): Promise<Map<IdProv, IdProv | IdDef>> {
  return transact(() => {
    const out = new Map<IdProv, IdProv | IdDef>();
    for (const prov of provs) {
      const op = opPorProv.get(prov);
      out.set(prov, op ? (defPorOp.get(op) ?? prov) : prov);
    }
    return out;
  });
}

/** Solo tests: vacía el mapa. */
export async function resetMappings(): Promise<void> {
  await transact(() => {
    provPorOp.clear();
    defPorOp.clear();
    opPorProv.clear();
    if (bdLista()) {
      try {
        bd().exec("DELETE FROM journal_idmap");
        tocar();
      } catch {
        // Memoria ya limpia: alcanza.
      }
    }
  });
}

/** Solo tests: pierde la memoria sin tocar SQLite (simula restart). */
export async function descartarMemoriaMappings(): Promise<void> {
  await transact(() => {
    provPorOp.clear();
    defPorOp.clear();
    opPorProv.clear();
  });
}

/** Reconstruye la memoria desde el diario (boot tras restart). Solo suma faltantes. */
export async function hidratarMappings(): Promise<void> {
  if (!bdLista()) return;
  await transact(() => {
    let rows: Array<{ [k: string]: string | number | Uint8Array | null }>;
    try {
      const out = bd().exec("SELECT op_id,prov,def FROM journal_idmap");
      if (out.length === 0) return;
      const cols = out[0]!.columns;
      rows = out[0]!.values.map((v) => Object.fromEntries(v.map((c, i) => [cols[i] as string, c])) as { [k: string]: string | number | Uint8Array | null });
    } catch {
      return;
    }
    for (const r of rows) {
      const op = String(r["op_id"]) as OpId;
      const prov = String(r["prov"]) as IdProv;
      if (!provPorOp.has(op)) {
        provPorOp.set(op, prov);
        if (!opPorProv.has(prov)) opPorProv.set(prov, op);
      }
      if (r["def"] !== null && r["def"] !== undefined && !defPorOp.has(op)) {
        defPorOp.set(op, String(r["def"]) as IdDef);
      }
    }
  });
}
