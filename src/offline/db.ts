import type { Database, SqlJsStatic } from "sql.js";

// Único dueño del acceso a persistencia local. Nadie más importa sqlite.
// Backing real: sql.js (SQLite-WASM) con la misma firma que tenía el stub.
// Tablas: snapshot+cursor (kv_meta), local journal (outbox/idmap), photos_queue,
// sync_state, offline_grant (filas cuando sus dueños las escriban).
//
// Durabilidad:
// - Navegador: snapshot OPFS `inventario.sqlite` (async, best-effort).
// - Node: archivo `OFFLINE_DB_PATH` si está seteado (dev/CI con disco).
// - Sin ninguno: memoria (tests existentes, sin cambios de conducta).
// La memoria sigue siendo la fuente de verdad en caliente; SQLite es el
// diario durable que hidrata al boot (ver hidratar* en outbox-store/id-mappings).

const DDL = `
CREATE TABLE IF NOT EXISTS journal_outbox(
  op_id TEXT PRIMARY KEY,
  device TEXT NOT NULL,
  seq INTEGER NOT NULL,
  hlc TEXT NOT NULL,
  kind TEXT NOT NULL,
  resumen TEXT NOT NULL,
  estado TEXT NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  def TEXT
);
CREATE TABLE IF NOT EXISTS journal_idmap(
  op_id TEXT PRIMARY KEY,
  prov TEXT NOT NULL,
  def TEXT
);
CREATE TABLE IF NOT EXISTS kv_meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS photos_queue(
  id TEXT PRIMARY KEY,
  op_id TEXT,
  sku TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  ancho INTEGER,
  alto INTEGER,
  miniatura TEXT NOT NULL DEFAULT 'pendiente',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  creado_en TEXT NOT NULL
);
`;

// Cadena de turnos: serializa transact() como una tx SQLite real.
// Sin dependencias nuevas; el cuerpo SQL vive en los dueños (outbox-store,
// id-mappings) dentro de su transact().
let tail: Promise<unknown> = Promise.resolve();

let engine: SqlJsStatic | null = null;
let base: Database | null = null;
let abiertas = false;
let persistEnVuelo = false;
let persistSucia = false;

export async function transact<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = tail.then(fn, fn) as Promise<T>;
  tail = run.catch(() => undefined);
  return run;
}

export const TABLAS_OFFLINE = [
  "snapshot",
  "local_movements",
  "cash_movements_local",
  "sale_local",
  "outbox",
  "id_mappings",
  "photos_queue",
  "sync_state",
  "offline_grant",
] as const;

export type TablaOffline = (typeof TABLAS_OFFLINE)[number];

function esNavegador(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function rutaArchivo(): string | null {
  if (!esNavegador() && typeof process !== "undefined" && process.env["OFFLINE_DB_PATH"]) {
    return process.env["OFFLINE_DB_PATH"] as string;
  }
  return null;
}

async function cargarBytes(): Promise<Uint8Array | null> {
  try {
    if (esNavegador() && "storage" in navigator && typeof navigator.storage.getDirectory === "function") {
      const dir = await navigator.storage.getDirectory();
      const fh = await dir.getFileHandle("inventario.sqlite", { create: false });
      const f = await fh.getFile();
      const buf = await f.arrayBuffer();
      return buf.byteLength > 0 ? new Uint8Array(buf) : null;
    }
  } catch {
    // Sin snapshot: arranca vacío.
  }
  const ruta = rutaArchivo();
  if (ruta) {
    try {
      const fs = await import("node:fs/promises");
      const b = await fs.readFile(ruta);
      return b.length > 0 ? new Uint8Array(b) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function guardarBytes(b: Uint8Array): Promise<void> {
  try {
    if (esNavegador() && "storage" in navigator && typeof navigator.storage.getDirectory === "function") {
      const dir = await navigator.storage.getDirectory();
      const fh = await dir.getFileHandle("inventario.sqlite", { create: true });
      const w = await fh.createWritable();
      // Copia a ArrayBuffer propio: el export de sql.js es ArrayBufferLike.
      await w.write(new Uint8Array(b));
      await w.close();
      return;
    }
  } catch {
    return;
  }
  const ruta = rutaArchivo();
  if (ruta) {
    try {
      const fs = await import("node:fs/promises");
      await fs.writeFile(ruta, b);
    } catch {
      // Best-effort: la memoria sigue mandando.
    }
  }
}

async function borrarBytes(): Promise<void> {
  try {
    if (esNavegador() && "storage" in navigator && typeof navigator.storage.getDirectory === "function") {
      const dir = await navigator.storage.getDirectory();
      await dir.removeEntry("inventario.sqlite");
      return;
    }
  } catch {
    return;
  }
  const ruta = rutaArchivo();
  if (ruta) {
    try {
      const fs = await import("node:fs/promises");
      await fs.unlink(ruta);
    } catch {
      // Ya no existía.
    }
  }
}

/** Abre el motor + snapshot y ejecuta el DDL real. Idempotente. */
export async function crearTablasVacias(): Promise<void> {
  if (!engine) {
    const { default: initSqlJs } = await import("sql.js");
    engine = await initSqlJs();
  }
  if (!base) {
    const bytes = await cargarBytes();
    base = new engine.Database(bytes ?? undefined);
  }
  base.exec(DDL);
  // PWA-S4: migracion best-effort para snapshots viejos con photos_queue
  // mínima (id, op_id, estado, creado_en). ADD COLUMN es idempotente por
  // columna; se ignora si ya existe.
  for (const sql of [
    "ALTER TABLE photos_queue ADD COLUMN sku TEXT",
    "ALTER TABLE photos_queue ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE photos_queue ADD COLUMN ancho INTEGER",
    "ALTER TABLE photos_queue ADD COLUMN alto INTEGER",
    "ALTER TABLE photos_queue ADD COLUMN miniatura TEXT NOT NULL DEFAULT 'pendiente'",
  ]) {
    try {
      base.exec(sql);
    } catch {
      // Columna ya existente: seguir.
    }
  }
  abiertas = true;
}

/** La base abierta. Lanza si no se llamó a crearTablasVacias (falla rápido). */
export function bd(): Database {
  if (!base || !abiertas) throw new Error("offline db sin abrir: llamá a crearTablasVacias");
  return base;
}

/** ¿Hay backend SQLite abierto? Los diarios escriben solo si es true. */
export function bdLista(): boolean {
  return abiertas && base !== null;
}

/** Marca sucio y persiste el snapshot (fire-and-forget, nunca lanza). */
export function tocar(): void {
  if (!bdLista()) return;
  void persistir();
}

async function persistir(): Promise<void> {
  if (persistEnVuelo) {
    persistSucia = true;
    return;
  }
  persistEnVuelo = true;
  try {
    for (;;) {
      persistSucia = false;
      if (!bdLista()) return;
      let bytes: Uint8Array;
      try {
        bytes = base!.export();
      } catch {
        return;
      }
      await guardarBytes(bytes);
      if (!persistSucia) return;
    }
  } finally {
    persistEnVuelo = false;
  }
}

/** Solo tests/arranque limpio: cierra, borra snapshot y vuelve a stub. */
export async function resetDb(): Promise<void> {
  abiertas = false;
  try {
    base?.close();
  } catch {
    // Ya cerrada.
  }
  base = null;
  tail = Promise.resolve();
  await borrarBytes();
}
