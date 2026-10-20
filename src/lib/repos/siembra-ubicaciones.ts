import { eq } from "drizzle-orm";
import { tenantLocationSeeds } from "../../db/schema-planes.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { tenantActual, tenantPorDefecto } from "../tenant-mode.js";
import { ubicacionesSembradasPorRubro } from "../eventos-control.js";

// ON4-SEED/ON4-5 (migración 0032): que las ubicaciones se sembraron desde la
// plantilla de rubro queda en tenant_location_seeds, no solo en control.events.
// Sin base resoluble (single sin DB) la memoria sigue siendo la fuente; un fallo
// de DB al leer cae a la memoria para no romper GET /api/locations.
function dbDe(tenantId: string): TenantDb | null {
  try {
    return dbVivaTenant(tenantId);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return null;
    throw e;
  }
}

export interface RegistroSiembra {
  readonly rubro: string;
  readonly version: string;
  readonly cantidad: number;
}

// Idempotente: la primera siembra gana (ON CONFLICT DO NOTHING).
export async function registrarSiembraUbicaciones(tenantId: string, r: RegistroSiembra): Promise<boolean> {
  const db = dbDe(tenantId);
  if (!db) return false;
  try {
    await db
      .insert(tenantLocationSeeds)
      .values({ tenantId, rubro: r.rubro, plantillaVersion: r.version, cantidad: r.cantidad })
      .onConflictDoNothing();
    return true;
  } catch {
    return false;
  }
}

export async function leerSembradasPorRubro(tenantId: string = tenantActual() ?? tenantPorDefecto()): Promise<boolean> {
  if (ubicacionesSembradasPorRubro(tenantId)) return true;
  const db = dbDe(tenantId);
  if (!db) return false;
  try {
    const filas = await db
      .select({ t: tenantLocationSeeds.tenantId })
      .from(tenantLocationSeeds)
      .where(eq(tenantLocationSeeds.tenantId, tenantId))
      .limit(1);
    return filas.length > 0;
  } catch {
    return false;
  }
}
