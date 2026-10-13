import { bd, bdLista, tocar, transact } from "./db.js";
import type { OpKind } from "./types.js";

// PWA-S4. Fotos en cola offline: 800px/200KB por foto, cupo 100 fotos/50MB,
// miniatura local "pendiente" al guardar y subida real tras los datos.
//
// Núcleo puro (validar/ajustar/cupo/orden) sin IO; el adaptador es memoria en
// caliente + diario SQLite espejo (como outbox-store). Nunca lanza por SQLite:
// si no hay backend, la memoria manda.

export const FOTO_LADO_MAX = 800;
export const FOTO_BYTES_MAX = 200 * 1024;
export const FOTOS_MAX_COUNT = 100;
export const FOTOS_MAX_BYTES = 50 * 1024 * 1024;

export type EstadoFoto = "pendiente" | "miniatura" | "subida" | "confirmada";

export interface FotoMeta {
  id: string;
  sku: string;
  bytes: number;
  ancho: number;
  alto: number;
  miniatura: "pendiente" | "lista";
  estado: EstadoFoto;
  creadoEn: string;
  opId: string | null;
}

export interface FotoInput {
  sku: string;
  bytes: number;
  ancho: number;
  alto: number;
  opId?: string | undefined;
  id?: string | undefined;
  creadoEn?: string | undefined;
}

/** Escala preservando aspecto para que el lado mayor sea <= 800. Puro. */
export function ajustarDimensiones(ancho: number, alto: number): { ancho: number; alto: number } {
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) {
    return { ancho: 0, alto: 0 };
  }
  const mayor = Math.max(ancho, alto);
  if (mayor <= FOTO_LADO_MAX) return { ancho: Math.round(ancho), alto: Math.round(alto) };
  const f = FOTO_LADO_MAX / mayor;
  return { ancho: Math.max(1, Math.round(ancho * f)), alto: Math.max(1, Math.round(alto * f)) };
}

export type ValidezFoto =
  | { ok: true; ancho: number; alto: number }
  | { ok: false; motivo: "dimensiones" | "peso" | "sku" };

/** Valida sku + dimensiones ajustadas + peso. Puro. */
export function validarFoto(input: FotoInput): ValidezFoto {
  if (!input.sku || !input.sku.trim()) return { ok: false, motivo: "sku" };
  if (!Number.isFinite(input.ancho) || !Number.isFinite(input.alto) || input.ancho <= 0 || input.alto <= 0) {
    return { ok: false, motivo: "dimensiones" };
  }
  const aj = ajustarDimensiones(input.ancho, input.alto);
  if (aj.ancho <= 0 || aj.alto <= 0) return { ok: false, motivo: "dimensiones" };
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > FOTO_BYTES_MAX) {
    return { ok: false, motivo: "peso" };
  }
  return { ok: true, ancho: aj.ancho, alto: aj.alto };
}

/** ¿Hay cupo para sumar `bytes`? Puro. */
export function hayCupo(actual: { count: number; bytes: number }, bytes: number): boolean {
  if (actual.count + 1 > FOTOS_MAX_COUNT) return false;
  if (actual.bytes + bytes > FOTOS_MAX_BYTES) return false;
  return true;
}

/** Orden de subida: datos primero, fotos al final (estable). Puro. */
export function ordenarParaSubida(kinds: OpKind[]): OpKind[] {
  const datos = kinds.filter((k) => k !== "foto");
  const fotos = kinds.filter((k) => k === "foto");
  return [...datos, ...fotos];
}

type SqlParam = string | number | null;

const fotos = new Map<string, FotoMeta>();

function nuevoId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // Fallback abajo.
  }
  return `foto-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

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

export type EncolarFotoResult = { ok: true; foto: FotoMeta } | { ok: false; motivo: "sku" | "dimensiones" | "peso" | "cupo" };

/**
 * Guarda una foto offline: valida 800px/200KB + cupo 100/50MB y deja la
 * miniatura en "pendiente" (la subida real ocurre tras los datos).
 */
export async function encolarFoto(input: FotoInput): Promise<EncolarFotoResult> {
  return transact(() => {
    const v = validarFoto(input);
    if (!v.ok) return { ok: false, motivo: v.motivo };
    const tot = totalesMemoria();
    if (!hayCupo(tot, input.bytes)) return { ok: false, motivo: "cupo" as const };
    const id = input.id ?? nuevoId();
    const prev = fotos.get(id);
    if (prev) return { ok: true, foto: prev };
    const foto: FotoMeta = {
      id,
      sku: input.sku,
      bytes: Math.round(input.bytes),
      ancho: v.ancho,
      alto: v.alto,
      miniatura: "pendiente",
      estado: "miniatura",
      creadoEn: input.creadoEn ?? new Date().toISOString(),
      opId: input.opId ?? null,
    };
    fotos.set(id, foto);
    diario(
      "INSERT OR IGNORE INTO photos_queue(id,op_id,sku,bytes,ancho,alto,miniatura,estado,creado_en) VALUES (?,?,?,?,?,?,?,?,?)",
      [foto.id, foto.opId, foto.sku, foto.bytes, foto.ancho, foto.alto, foto.miniatura, foto.estado, foto.creadoEn],
    );
    return { ok: true, foto };
  });
}

/** Marca la miniatura local como lista (sigue pendiente de subida). */
export async function marcarMiniaturaLista(id: string): Promise<void> {
  await transact(() => {
    const f = fotos.get(id);
    if (!f) return;
    const next: FotoMeta = { ...f, miniatura: "lista" };
    fotos.set(id, next);
    diario("UPDATE photos_queue SET miniatura=? WHERE id=?", [next.miniatura, id]);
  });
}

/** Marca la foto como subida (tras confirmar los datos). Idempotente. */
export async function marcarSubida(id: string): Promise<void> {
  await transact(() => {
    const f = fotos.get(id);
    if (!f) return;
    if (f.estado === "confirmada") return;
    const next: FotoMeta = { ...f, miniatura: "lista", estado: "subida" };
    fotos.set(id, next);
    diario("UPDATE photos_queue SET miniatura=?,estado=? WHERE id=?", [next.miniatura, next.estado, id]);
  });
}

/** Confirma la foto del lado servidor. Idempotente. */
export async function confirmarFoto(id: string): Promise<void> {
  await transact(() => {
    const f = fotos.get(id);
    if (!f) return;
    const next: FotoMeta = { ...f, miniatura: "lista", estado: "confirmada" };
    fotos.set(id, next);
    diario("UPDATE photos_queue SET miniatura=?,estado=? WHERE id=?", [next.miniatura, next.estado, id]);
  });
}

/** Pendientes de subida (todo lo no confirmado), en orden de creación. */
export async function pendientesFotos(): Promise<FotoMeta[]> {
  return transact(() =>
    [...fotos.values()].filter((f) => f.estado !== "confirmada").sort((a, b) => (a.creadoEn < b.creadoEn ? -1 : 1)),
  );
}

export interface TotalesFotos {
  count: number;
  bytes: number;
}

function totalesMemoria(): TotalesFotos {
  let bytes = 0;
  for (const f of fotos.values()) {
    if (f.estado !== "confirmada") bytes += f.bytes;
  }
  const count = [...fotos.values()].filter((f) => f.estado !== "confirmada").length;
  return { count, bytes };
}

/** Totales no confirmados (para enforcing de cupo en UI). */
export async function totalesFotos(): Promise<TotalesFotos> {
  return transact(() => totalesMemoria());
}

/** Solo tests/arranque: vacía memoria + diario. */
export async function resetFotos(): Promise<void> {
  await transact(() => {
    fotos.clear();
    if (bdLista()) {
      try {
        bd().exec("DELETE FROM photos_queue");
        tocar();
      } catch {
        // Memoria ya limpia: alcanza.
      }
    }
  });
}

/** Solo tests: pierde la memoria sin tocar SQLite (simula restart). */
export async function descartarMemoriaFotos(): Promise<void> {
  await transact(() => {
    fotos.clear();
  });
}

/** Reconstruye la memoria desde el diario (boot tras restart). Solo suma faltantes. */
export async function hidratarFotos(): Promise<void> {
  if (!bdLista()) return;
  await transact(() => {
    let rows: Array<{ [k: string]: string | number | Uint8Array | null }>;
    try {
      const out = bd().exec("SELECT id,op_id,sku,bytes,ancho,alto,miniatura,estado,creado_en FROM photos_queue ORDER BY creado_en");
      if (out.length === 0) return;
      const cols = out[0]?.columns ?? [];
      rows = (out[0]?.values ?? []).map(
        (v) => Object.fromEntries(v.map((c, i) => [cols[i] as string, c])) as { [k: string]: string | number | Uint8Array | null },
      );
    } catch {
      return;
    }
    for (const r of rows) {
      const id = String(r["id"] ?? "");
      if (!id || fotos.has(id)) continue;
      const estado = String(r["estado"] ?? "pendiente");
      if (estado !== "pendiente" && estado !== "miniatura" && estado !== "subida" && estado !== "confirmada") continue;
      const mini = String(r["miniatura"] ?? "pendiente");
      fotos.set(id, {
        id,
        sku: String(r["sku"] ?? ""),
        bytes: Number(r["bytes"] ?? 0),
        ancho: Number(r["ancho"] ?? 0),
        alto: Number(r["alto"] ?? 0),
        miniatura: mini === "lista" ? "lista" : "pendiente",
        estado: estado as EstadoFoto,
        creadoEn: String(r["creado_en"] ?? new Date().toISOString()),
        opId: r["op_id"] === null || r["op_id"] === undefined ? null : String(r["op_id"]),
      });
    }
  });
}

// PWA-S4: subida real tras los datos. Pide upload-url y cae a cola si no hay red.
// Nunca lanza: sin fetch/red devuelve ok:false y la foto queda pendiente.
export interface SubirFotoInput {
  fotoId: string;
  sha256: string;
  contentType: "image/jpeg" | "image/webp";
  moduloOrigen: "inventory" | "purchases" | "tickets";
  fetchImpl?: typeof fetch;
  uploadBase?: string;
}

export async function subirFoto(input: SubirFotoInput): Promise<{ ok: boolean; uploadUrl?: string; motivo?: string }> {
  const f = fotos.get(input.fotoId);
  if (!f) return { ok: false, motivo: "desconocida" };
  const fetcher = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== "function") return { ok: false, motivo: "sin_red" };
  try {
    const r = await fetcher(input.uploadBase ?? "/api/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: input.contentType,
        bytes: f.bytes,
        sha256: input.sha256,
        modulo_origen: input.moduloOrigen,
      }),
    });
    if (!r.ok) return { ok: false, motivo: `http_${r.status}` };
    const j = (await r.json()) as { upload_url?: string };
    if (!j.upload_url) return { ok: false, motivo: "sin_url" };
    await marcarSubida(input.fotoId);
    return { ok: true, uploadUrl: j.upload_url };
  } catch {
    return { ok: false, motivo: "sin_red" };
  }
}
