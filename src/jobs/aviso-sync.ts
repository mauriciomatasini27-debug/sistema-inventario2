import { and, gt, isNull, lte, sql } from "drizzle-orm";
import { deviceSyncState } from "../db/schema-sync.js";
import { dbVivaTenant } from "../lib/server-db.js";
import { crearAlmacenDeviceSync } from "../lib/repos/_almacen.js";
import { store } from "../lib/store.js";
import { enCuarentena, horasSinSync, nivelAviso } from "../offline/avisos.js";

// Job aviso-sync SYNC-S4 (diario). En memoria lista devices con 24/60/72h
// sin sync. No muta: el heartbeat ya actualiza ultimaVistaEn; acá solo se
// informa. Idempotente por construcción (lectura).
export interface AvisoSync {
  device_code: string;
  horas: number;
  nivel: 24 | 60 | 72;
  cuarentena: boolean;
}

export function ejecutarAvisoSync(ahora: Date = new Date()): {
  revisados: number;
  avisos: AvisoSync[];
} {
  const avisos: AvisoSync[] = [];
  for (const [deviceCode, d] of store.deviceSync) {
    const horas = horasSinSync(d.ultimaVistaEn, ahora);
    const nivel = nivelAviso(horas);
    if (nivel === null) continue;
    avisos.push({
      device_code: deviceCode,
      horas: Math.round(horas * 10) / 10,
      nivel,
      cuarentena: enCuarentena(horas),
    });
  }
  return { revisados: store.deviceSync.size, avisos };
}

function aAviso(deviceCode: string, ultimaVista: Date, ahora: Date, nivel: 24 | 60 | 72): AvisoSync {
  const horas = horasSinSync(ultimaVista.toISOString(), ahora);
  return {
    device_code: deviceCode,
    horas: Math.round(horas * 10) / 10,
    nivel,
    cuarentena: enCuarentena(horas),
  };
}

// SYNC-S4 durable: con base viva del tenant los estados se leen de
// `device_sync_state` y cada nivel se reclama con UN solo UPDATE condicional
// ... RETURNING (idempotente: corridas concurrentes marcan una sola vez).
// Bandas por antigüedad para avisar un solo nivel por corrida: 72h+ reclama
// 72, 60-72h reclama 60, 24-60h reclama 24. Sin base cae a memoria como hoy.
export async function ejecutarAvisoSyncDuro(ahora: Date = new Date()): Promise<{
  revisados: number;
  avisos: AvisoSync[];
}> {
  const espejo = crearAlmacenDeviceSync();
  const db = dbVivaTenant();
  if (!db) return ejecutarAvisoSync(ahora);
  try {
    const totalFilas = await db.select({ n: sql`count(*)` }).from(deviceSyncState);
    const revisados = Number(totalFilas[0]?.n ?? 0);
    const corte24 = new Date(ahora.getTime() - 24 * 3_600_000);
    const corte60 = new Date(ahora.getTime() - 60 * 3_600_000);
    const corte72 = new Date(ahora.getTime() - 72 * 3_600_000);
    const avisos: AvisoSync[] = [];

    const r72 = await db
      .update(deviceSyncState)
      .set({ aviso72En: ahora })
      .where(and(lte(deviceSyncState.ultimaVistaEn, corte72), isNull(deviceSyncState.aviso72En)))
      .returning({ deviceCode: deviceSyncState.deviceCode, ultimaVistaEn: deviceSyncState.ultimaVistaEn });
    for (const f of r72) avisos.push(aAviso(f.deviceCode, f.ultimaVistaEn, ahora, 72));

    const r60 = await db
      .update(deviceSyncState)
      .set({ aviso60En: ahora })
      .where(
        and(
          lte(deviceSyncState.ultimaVistaEn, corte60),
          gt(deviceSyncState.ultimaVistaEn, corte72),
          isNull(deviceSyncState.aviso60En),
        ),
      )
      .returning({ deviceCode: deviceSyncState.deviceCode, ultimaVistaEn: deviceSyncState.ultimaVistaEn });
    for (const f of r60) avisos.push(aAviso(f.deviceCode, f.ultimaVistaEn, ahora, 60));

    const r24 = await db
      .update(deviceSyncState)
      .set({ aviso24En: ahora })
      .where(
        and(
          lte(deviceSyncState.ultimaVistaEn, corte24),
          gt(deviceSyncState.ultimaVistaEn, corte60),
          isNull(deviceSyncState.aviso24En),
        ),
      )
      .returning({ deviceCode: deviceSyncState.deviceCode, ultimaVistaEn: deviceSyncState.ultimaVistaEn });
    for (const f of r24) avisos.push(aAviso(f.deviceCode, f.ultimaVistaEn, ahora, 24));

    return { revisados, avisos };
  } catch (e) {
    espejo.anteFalloPersistencia(e);
    return ejecutarAvisoSync(ahora);
  }
}
