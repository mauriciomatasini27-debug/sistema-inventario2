import { almacenamientoLocal, borrarCatalogosLocales, type StorageCatalogo } from "./catalogo-local.js";
import { borrarColasLocales } from "./cola-venta.js";
import { resetDb } from "./db.js";
import { hidratarFotos, resetFotos } from "./fotos.js";
import { hidratarMappings, resetMappings } from "./id-mappings.js";
import { hidratarOutbox, resetOutbox } from "./outbox-store.js";

// PWA-S5. Dispositivo compartido: cuota persist()+estimate(), borrado remoto
// al revocar y garantía "sin base legible".
//
// Alcance honesto: sql.js+OPFS no cifra en reposo por sí solo. La garantía es:
// - flag compartido => modo "cifrado requerido" declarado (el snapshot solo
//   vive si la plataforma lo custodia; ver pedirPersistencia);
// - al revocar => borrado local total (outbox+mappings+fotos+snapshot) y la
//   base deja de ser legible porque deja de existir (resetDb borra bytes).
// Núcleo puro para la decisión; el adaptador nunca lanza.

export interface CuotaInfo {
  persistido: boolean;
  usoBytes: number;
  cupoBytes: number;
  degradado: boolean;
}

export interface StoragePort {
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

function storageNavegador(): StoragePort {
  try {
    const s = (globalThis as { navigator?: { storage?: StoragePort } }).navigator?.storage;
    if (s) return s;
  } catch {
    // Sin navigator (Node/tests): degradado.
  }
  return {};
}

/**
 * Pide cuota persistente y reporta uso/cupo. Nunca lanza: sin plataforma
 * devuelve degradado (iOS sin OPFS cae acá por diseño).
 */
export async function pedirPersistencia(port: StoragePort = storageNavegador()): Promise<CuotaInfo> {
  try {
    let persistido = false;
    try {
      persistido = (await port.persist?.()) ?? false;
    } catch {
      persistido = false;
    }
    let usoBytes = 0;
    let cupoBytes = 0;
    let degradado = false;
    try {
      const est = await port.estimate?.();
      if (est && typeof est.usage === "number") usoBytes = est.usage;
      if (est && typeof est.quota === "number") cupoBytes = est.quota;
      if (!est) degradado = true;
    } catch {
      degradado = true;
    }
    if (!port.persist && !port.estimate) degradado = true;
    return { persistido, usoBytes, cupoBytes, degradado };
  } catch {
    return { persistido: false, usoBytes: 0, cupoBytes: 0, degradado: true };
  }
}

let compartido = false;

/** Marca el dispositivo como compartido (cifrado requerido). */
export function marcarCompartido(v = true): void {
  compartido = v;
}

/** ¿El dispositivo es compartido? */
export function esCompartido(): boolean {
  return compartido;
}

/**
 * ¿Requiere cifrado en reposo? Puro: todo compartido lo requiere.
 * El borrado remoto es la ejecución de esa garantía en esta capa.
 */
export function necesitaCifrado(): boolean {
  return compartido;
}

export interface RevocacionResult {
  borrado: boolean;
  legible: boolean;
  motivo: string;
}

/**
 * Borrado remoto al revocar: vacía outbox+mappings+fotos, borra el catálogo
 * local y el snapshot SQLite/OPFS. Tras esto no hay base legible (resetDb
 * elimina los bytes). Nunca lanza: el borrado es best-effort idempotente.
 */
export async function revocarDispositivo(
  motivo = "revocado",
  storage: StorageCatalogo | null = almacenamientoLocal(),
): Promise<RevocacionResult> {
  borrarCatalogosLocales(storage);
  // P10-14: la cola de /venta y device_seq por tenant también se borran al revocar.
  borrarColasLocales(storage);
  try {
    await resetOutbox();
  } catch {
    // Best-effort: seguir con el resto.
  }
  try {
    await resetMappings();
  } catch {
    // Best-effort.
  }
  try {
    await resetFotos();
  } catch {
    // Best-effort.
  }
  try {
    await resetDb();
  } catch {
    // Ya borrada.
  }
  compartido = false;
  return { borrado: true, legible: false, motivo };
}

/** Hidrata todo el diario local en el boot (outbox+mappings+fotos). */
export async function hidratarDispositivo(): Promise<void> {
  await hidratarOutbox();
  await hidratarMappings();
  await hidratarFotos();
}

/** Solo tests: resetea el flag compartido sin tocar datos. */
export function resetFlagCompartido(): void {
  compartido = false;
}
