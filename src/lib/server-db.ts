import { getTenantDb } from "./db.js";
import { esModoAisladoPorTenant, esModoShared } from "./tenant-mode.js";

function sinUrlCompartida(e: unknown): boolean {
  return e instanceof Error && e.message === "Falta TENANT_DATABASE_URL";
}

// Write-through Postgres best-effort para Slice-0 (C1.3b).
// El store en memoria sigue siendo la fuente de verdad en monoproceso;
// esto solo agrega copia durable cuando hay DB viva. En single nunca lanza:
// si no hay env, tabla o conexión (tests/build/sin Postgres), el caller sigue
// con memoria. En multi/shared (PERS2-S2, ADR-0116) la falta de base ya no
// cae a memoria: se propaga BaseNoDisponible y la ruta responde 503.

export type TenantDb = ReturnType<typeof getTenantDb>;

export class BaseNoDisponible extends Error {
  constructor(mensaje = "base_no_disponible") {
    super(mensaje);
    this.name = "BaseNoDisponible";
  }
}

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

/** Ejecuta fn contra el tenant DB. Devuelve true si persistió, false si cayó a memoria (solo single). En multi lanza BaseNoDisponible. */
export async function intentarPersistir(fn: (db: TenantDb) => Promise<unknown>, tenantId?: string): Promise<boolean> {
  try {
    await fn(getTenantDb(tenantId));
    return true;
  } catch (e) {
    // ADR-0116: shared sin URL es lab/tests (memoria partida). multi sin URL_<id> sigue 503.
    if (esModoShared() && sinUrlCompartida(e)) return false;
    if (esModoAisladoPorTenant()) throw aBaseNoDisponible(e);
    return false;
  }
}

/** Lee del tenant DB. Devuelve null si no hay DB (el caller usa memoria, solo single). En multi/shared lanza BaseNoDisponible. */
export async function intentarLeer<T>(fn: (db: TenantDb) => Promise<T>, tenantId?: string): Promise<T | null> {
  try {
    return await fn(getTenantDb(tenantId));
  } catch (e) {
    if (esModoShared() && sinUrlCompartida(e)) return null;
    if (esModoAisladoPorTenant()) throw aBaseNoDisponible(e);
    return null;
  }
}

/** DB del tenant actual o null (solo single). En multi/shared lanza BaseNoDisponible en lugar de caer a memoria. Reemplaza los dbViva() locales. */
export function dbVivaTenant(tenantId?: string): TenantDb | null {
  try {
    return getTenantDb(tenantId);
  } catch (e) {
    if (esModoShared() && sinUrlCompartida(e)) return null;
    if (esModoAisladoPorTenant()) throw aBaseNoDisponible(e);
    return null;
  }
}
