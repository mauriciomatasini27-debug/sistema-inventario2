import { and, eq, inArray } from "drizzle-orm";
import { devices } from "../../db/schema.js";
import { dbVivaTenant } from "../server-db.js";
import { fijarNombreEnMemoria, nombresEnMemoria } from "../nombres-dispositivos-memoria.js";

// P10-34 [tenant]: #357; la fuente del nombre del device es devices.nombre de
// P10-34 [tenant]: la base del comercio. El Map queda como espejo y como fuente
// P10-34 [tenant]: en single sin base. dbVivaTenant lanza BaseNoDisponible en
// P10-34 [tenant]: multi/shared sin base, así la ruta decide 503 antes de escribir.

export interface FuenteNombreDevice {
  readonly fuente: "db" | "memoria";
}

export interface NombresDevices {
  readonly nombres: Map<string, string>;
  readonly fuente: "db" | "memoria";
}

// P10-34 [tenant]: escribe el nombre y deja el espejo; en single sin DB la
// P10-34 [tenant]: memoria manda y en multi sin DB lanza BaseNoDisponible.
export async function guardarNombreDevice(
  tenantId: string,
  deviceCode: string,
  nombre: string,
): Promise<FuenteNombreDevice> {
  // P10-34 [tenant]: el chequeo de base va primero; en multi sin base no se
  // P10-34 [tenant]: toca el espejo para no dejar un nombre que parezca persistido.
  const db = dbVivaTenant(tenantId);
  fijarNombreEnMemoria(deviceCode, nombre);
  if (!db) return { fuente: "memoria" };
  try {
    await db
      .insert(devices)
      .values({
        tenantId,
        deviceCode,
        nombre,
        // P10-34 [tenant]: devices exige plataforma y versión aunque el alta
        // P10-34 [tenant]: real escriba device_sync_state; estos valores son marcadores.
        plataforma: "desconocida",
        appVersion: "0",
      })
      .onConflictDoUpdate({
        target: [devices.tenantId, devices.deviceCode],
        set: { nombre },
      });
    return { fuente: "db" };
  } catch {
    return { fuente: "memoria" };
  }
}

// P10-34 [tenant]: lee los nombres desde DB e hidrata el espejo; sin base
// P10-34 [tenant]: (single) la memoria es la única fuente.
export async function nombresDevices(
  tenantId: string,
  deviceCodes: readonly string[],
): Promise<NombresDevices> {
  const db = dbVivaTenant(tenantId);
  const codes = [...new Set(deviceCodes.filter((c) => c.trim().length > 0))];
  if (!db) return { nombres: nombresEnMemoria(codes), fuente: "memoria" };
  try {
    const filas = codes.length
      ? await db
          .select({ deviceCode: devices.deviceCode, nombre: devices.nombre })
          .from(devices)
          .where(and(eq(devices.tenantId, tenantId), inArray(devices.deviceCode, codes)))
      : [];
    const nombres = new Map<string, string>();
    for (const f of filas) {
      if (!f.nombre) continue;
      nombres.set(f.deviceCode, f.nombre);
      fijarNombreEnMemoria(f.deviceCode, f.nombre);
    }
    return { nombres, fuente: "db" };
  } catch {
    return { nombres: nombresEnMemoria(codes), fuente: "memoria" };
  }
}
