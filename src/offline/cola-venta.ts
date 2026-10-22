export interface ItemCola {
  op_id: string;
  device_code: string;
  device_seq: number;
  payload: unknown;
}

// P10-14 (PRD-PWA-01 / PRD-SYNC-01): la cola y el contador device_seq son por
// tenant (mismo bug que P10-13 corrigio para el catalogo). Claves
// `slice0-outbox:<tenant>` y `slice0-seq:<tenant>`; las claves legadas globales
// quedan solo para arrancar sin tenant y para drenar pendientes hasta secarlas.
export const CLAVE_LEGADA_OUTBOX = "slice0-outbox";
export const CLAVE_LEGADA_SEQ = "slice0-seq";

export function claveOutboxCola(tenantId: string | null): string {
  return tenantId ? CLAVE_LEGADA_OUTBOX + ":" + tenantId : CLAVE_LEGADA_OUTBOX;
}

export function claveSeqCola(tenantId: string | null): string {
  return tenantId ? CLAVE_LEGADA_SEQ + ":" + tenantId : CLAVE_LEGADA_SEQ;
}

export interface StorageCola {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
  keys?(): string[];
}

/**
 * Primer arranque con tenant: hereda el valor del contador legado una sola vez
 * para no reusar device_seq ya confirmados por el servidor. Si la clave por
 * tenant ya esta en un valor mayor, prevalece.
 */
export function copiarSeqLegado(storage: StorageCola, tenantId: string | null): void {
  if (!tenantId) return;
  try {
    const legado = Number(storage.getItem(CLAVE_LEGADA_SEQ) ?? "0");
    const actual = Number(storage.getItem(claveSeqCola(tenantId)) ?? "0");
    if (legado > actual) storage.setItem(claveSeqCola(tenantId), String(legado));
  } catch (error) {
    console.warn("[cola-venta] contador legado", error);
  }
}

/**
 * Borrado remoto (revocarDispositivo): borra las claves legadas y todas las
 * `slice0-outbox:*` / `slice0-seq:*` de cualquier tenant. Nunca lanza.
 */
export function borrarColasLocales(storage: StorageCola | null): void {
  if (!storage) return;
  for (const clave of [CLAVE_LEGADA_OUTBOX, CLAVE_LEGADA_SEQ]) {
    try {
      storage.removeItem(clave);
    } catch (error) {
      console.warn("[cola-venta] no se pudo borrar la cola legada", error);
    }
  }
  let claves: string[] = [];
  if (typeof storage.keys === "function") {
    try {
      claves = storage.keys();
    } catch (error) {
      console.warn("[cola-venta] no se pudieron enumerar las claves", error);
    }
  }
  if (!Array.isArray(claves)) return;
  for (const clave of claves) {
    if (typeof clave !== "string") continue;
    if (!clave.startsWith(CLAVE_LEGADA_OUTBOX + ":") && !clave.startsWith(CLAVE_LEGADA_SEQ + ":")) continue;
    try {
      storage.removeItem(clave);
    } catch (error) {
      console.warn("[cola-venta] no se pudo borrar la cola", error);
    }
  }
}

export interface RespuestaPush {
  status: number;
  cuerpo: unknown;
}

export interface DepsColaVenta {
  leer(): ItemCola[];
  escribir(items: ItemCola[]): void;
  enviar(item: ItemCola): Promise<RespuestaPush>;
}

export interface ResultadoColaVenta {
  confirmados: number;
  pendientes: number;
  sensibles: number;
  cortado: boolean;
}

function esRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function contarSensibles(cuerpo: unknown): number {
  const lista: unknown[] = esRecord(cuerpo) && Array.isArray(cuerpo["resultados"]) ? cuerpo["resultados"] : [cuerpo];
  let n = 0;
  for (const uno of lista) {
    if (esRecord(uno) && uno["resultado"] === "necesita_conexion") n += 1;
  }
  return n;
}

export function quitarConfirmados(cola: ItemCola[], confirmados: ItemCola[]): ItemCola[] {
  const ids = new Set(confirmados.map((i) => i.op_id));
  return cola.filter((i) => !ids.has(i.op_id));
}

export async function sincronizarColaVenta(deps: DepsColaVenta): Promise<ResultadoColaVenta> {
  const cola = deps.leer();
  const confirmados: ItemCola[] = [];
  let sensibles = 0;
  let cortado = false;
  for (const item of cola) {
    let r: RespuestaPush;
    try {
      r = await deps.enviar(item);
    } catch (error) {
      console.warn("[cola-venta] push sin red", item.op_id, error);
      cortado = true;
      break;
    }
    if (r.status < 200 || r.status >= 300) {
      console.warn("[cola-venta] push no confirmado", item.op_id, r.status);
      cortado = true;
      break;
    }
    confirmados.push(item);
    sensibles += contarSensibles(r.cuerpo);
  }
  const restantes = quitarConfirmados(deps.leer(), confirmados);
  deps.escribir(restantes);
  return { confirmados: confirmados.length, pendientes: restantes.length, sensibles, cortado };
}
