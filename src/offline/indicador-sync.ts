// P1-29: el tono sale de un solo reducer. El ping a /api/health (OF5.4) queda
// afuera para no mezclar "hay red" con "el servidor responde".
import { CLAVE_LEGADA_OUTBOX, claveOutboxCola, type StorageCola } from "./cola-venta.js";

export type TonoIndicador = "verde" | "ambar" | "azul" | "rojo";

export interface EntradaIndicadorSync {
  online: boolean;
  pendientes: number;
  sincronizando: boolean;
  cortado: boolean;
}

export interface VistaIndicadorSync {
  tono: TonoIndicador;
  etiqueta: string;
}

function pendientesVisibles(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function textoPendientes(n: number): string {
  return n === 1 ? "1 pendiente" : `${n} pendientes`;
}

export function reducirIndicadorSync(entrada: EntradaIndicadorSync): VistaIndicadorSync {
  const n = pendientesVisibles(entrada.pendientes);
  const conCuenta = (base: string) => (n > 0 ? `${base} · ${textoPendientes(n)}` : base);
  if (entrada.sincronizando) return { tono: "azul", etiqueta: conCuenta("Sincronizando") };
  if (entrada.cortado) return { tono: "rojo", etiqueta: conCuenta("Con problemas") };
  if (!entrada.online) return { tono: "ambar", etiqueta: conCuenta("Sin conexión") };
  if (n > 0) return { tono: "ambar", etiqueta: textoPendientes(n) };
  return { tono: "verde", etiqueta: "En línea" };
}

function largoCola(storage: StorageCola, clave: string): number {
  const crudo = storage.getItem(clave);
  if (!crudo) return 0;
  try {
    const valor = JSON.parse(crudo) as unknown;
    return Array.isArray(valor) ? valor.length : 0;
  } catch {
    return 0;
  }
}

export function contarPendientesCola(storage: StorageCola, tenantId: string | null): number {
  const tenant = tenantId ? tenantId : null;
  const propia = largoCola(storage, claveOutboxCola(tenant));
  // Sin tenant la clave propia ya es la legada. Sumarla otra vez infla el chip.
  if (!tenant) return propia;
  return propia + largoCola(storage, CLAVE_LEGADA_OUTBOX);
}
