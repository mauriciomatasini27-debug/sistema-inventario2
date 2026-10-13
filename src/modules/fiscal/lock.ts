// Lock serial + in-flight fiscal por (cuit, ptoVta, tipo) — ADR-0018 D4/D5.
// Slice C1 monoproceso: mutex por clave con cadena de promesas; en Postgres
// C2 es pg_advisory_xact_lock(hash(cuit,pv,tipo)) + fila fiscal_sequences con
// in_flight_document_id — misma clave, mismo orden, misma semántica.

const colas = new Map<string, Promise<void>>();
const enVuelo = new Map<string, string>();

export function clave_fiscal(
  cuit: string | number,
  ptoVta: number | string,
  cbteTipo: number | string,
): string {
  return `${cuit}:${ptoVta}:${cbteTipo}`;
}

// Ejecuta fn estrictamente serial por clave: dos llamadas con la misma clave
// nunca se intercalan (un comprobante por FECAESolicitar en C).
export async function con_lock_fiscal<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  const previo = colas.get(clave) ?? Promise.resolve();
  let done!: () => void;
  const actual = new Promise<void>((res) => {
    done = res;
  });
  colas.set(clave, previo.then(() => actual));
  await previo;
  try {
    return await fn();
  } finally {
    done();
  }
}

// Lock lógico retenido (D5): mientras un doc está enviando/respuesta_incierta
// la secuencia apunta a él y otro doc no puede tomar número en la clave.
// Devuelve false si otro doc lo retiene (el llamante retrocede a pendiente).
export function marcar_en_vuelo(clave: string, docId: string): boolean {
  const holder = enVuelo.get(clave);
  if (holder !== undefined && holder !== docId) return false;
  enVuelo.set(clave, docId);
  return true;
}

export function liberar_en_vuelo(clave: string, docId: string): void {
  if (enVuelo.get(clave) === docId) enVuelo.delete(clave);
}

export function en_vuelo_por(clave: string): string | null {
  return enVuelo.get(clave) ?? null;
}

export function limpiar_en_vuelo(): void {
  enVuelo.clear();
}

// C2 Postgres: misma clave, mismo orden, misma semántica que el mutex.
// Uso: SELECT pg_advisory_xact_lock(hashtext($1)) + UPDATE fiscal_sequences
// con in_flight_document_id. Si rowCount=0, otro doc retiene → pendiente.
export function sql_advisory_lock(clave: string): { sql: string; params: [string] } {
  return { sql: "SELECT pg_advisory_xact_lock(hashtext($1))", params: [clave] };
}

export function sql_reclamar_secuencia(): string {
  return [
    "UPDATE fiscal_sequences SET in_flight_document_id = $1",
    "WHERE punto_venta = $2 AND cbte_tipo = $3",
    "AND in_flight_document_id IS NULL",
  ].join(" ");
}
