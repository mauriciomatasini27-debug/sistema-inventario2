import { createHash } from "node:crypto";

// P1-69: pendientes por posición en el journal (no por hash de SQL viejo
// reescrito). Evita que drizzle-kit reintente migraciones ya aplicadas.

/**
 * @param {string} sqlText
 * @returns {string}
 */
export function hashMigration(sqlText) {
  return createHash("sha256").update(sqlText).digest("hex");
}

/**
 * @param {string} sqlText
 * @returns {string[]}
 */
export function splitStatements(sqlText) {
  return String(sqlText ?? "")
    .split(/-->\s*statement-breakpoint\s*/g)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !/^\s*--/.test(line))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * @param {string} statement
 * @returns {string | null}
 */
export function tablaDeStatement(statement) {
  const s = String(statement ?? "");
  const alter = s.match(/ALTER\s+TABLE\s+"([^"]+)"/i);
  if (alter) return alter[1];
  const on = s.match(/ON\s+"([^"]+)"/i);
  if (on) return on[1];
  const create = s.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i);
  if (create) return create[1];
  return null;
}

/**
 * @param {{ journalEntries: { idx: number, tag: string, when: number }[], appliedCount: number }} args
 * @returns {{ ok: true, pendientes: { idx: number, tag: string, when: number }[] } | { ok: false, error: string }}
 */
export function planPendientes({ journalEntries, appliedCount }) {
  const entries = Array.isArray(journalEntries) ? journalEntries : [];
  const n = Number(appliedCount);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "appliedCount inválido." };
  }
  if (n > entries.length) {
    return {
      ok: false,
      error: `La DB tiene ${n} migraciones y el journal solo ${entries.length}.`,
    };
  }
  return { ok: true, pendientes: entries.slice(n) };
}

function esCreateTable(statement) {
  return /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"/i.test(String(statement ?? ""));
}

/**
 * @param {{ statements: string[], tablasExistentes: Iterable<string> }} args
 * @returns {{ run: string[], skip: { tabla: string, sql: string }[] }}
 */
export function filtrarStatementsPorTablas({ statements, tablasExistentes }) {
  const hay = new Set(tablasExistentes);
  /** @type {string[]} */
  const run = [];
  /** @type {{ tabla: string, sql: string }[]} */
  const skip = [];
  for (const sql of statements) {
    if (esCreateTable(sql)) {
      const creada = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i);
      if (creada) hay.add(creada[1]);
      run.push(sql);
      continue;
    }
    const tabla = tablaDeStatement(sql);
    // Sin tabla reconocida (p.ej. CREATE SCHEMA, UPDATE): se ejecuta igual.
    if (tabla && !hay.has(tabla)) {
      skip.push({ tabla, sql });
      continue;
    }
    run.push(sql);
  }
  return { run, skip };
}
