import { getTenantDb } from "./db.js";

// Write-through Postgres best-effort para Slice-0 (C1.3b).
// El store en memoria sigue siendo la fuente de verdad en monoproceso;
// esto solo agrega copia durable cuando hay DB viva. Nunca lanza: si no hay
// env, tabla o conexión (tests/build/sin Postgres), el caller sigue con memoria.

export type TenantDb = ReturnType<typeof getTenantDb>;

/** Ejecuta fn contra el tenant DB. Devuelve true si persistió, false si cayó a memoria. */
export async function intentarPersistir(fn: (db: TenantDb) => Promise<unknown>, tenantId?: string): Promise<boolean> {
  try {
    await fn(getTenantDb(tenantId));
    return true;
  } catch {
    return false;
  }
}

/** Lee del tenant DB. Devuelve null si no hay DB (el caller usa memoria). */
export async function intentarLeer<T>(fn: (db: TenantDb) => Promise<T>, tenantId?: string): Promise<T | null> {
  try {
    return await fn(getTenantDb(tenantId));
  } catch {
    return null;
  }
}
