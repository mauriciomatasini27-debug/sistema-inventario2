import { store } from "../lib/store.js";
import { enCuarentena, horasSinSync, nivelAviso } from "../offline/avisos.js";

// Job aviso-sync SYNC-S4 (diario). Recorre device_sync_state en memoria y
// lista devices con 24/60/72h sin sync. No muta: el heartbeat ya actualiza
// ultimaVistaEn; acá solo se informa. Idempotente por construcción (lectura).
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
