import { control, store } from "./store.js";
import { enCuarentena, horasSinSync } from "../offline/avisos.js";

// Gate servidor SYNC-S7: operaciones sensibles exigen online.
// Sensibles: topes, retiro dueño, cierre, reversión, export (nunca en AlcanceGrant).
// Si el request trae marcas offline (grant JWT/id, cuarentena, device en
// cuarentena) se devuelve 403. Sin marcas => online => null (permitir).

export const ALCANCES_SENSIBLES = ["topes", "retiro_dueno", "cierre", "reversion", "export"] as const;
export type AlcanceSensible = (typeof ALCANCES_SENSIBLES)[number];

function respuesta403(mensaje: string, codigo: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: mensaje, codigo, ...extra }, { status: 403 });
}

/** ¿Grant revocado (cuarentena post-revocación)? Chequea memoria. */
export function estaRevocadoEnCuarentena(grantId: string): boolean {
  const g = control.offlineGrants.get(grantId);
  return Boolean(g?.revocadoEn);
}

export function exigirOnlineParaSensible(request: Request, alcance?: string): Response | null {
  const grantToken =
    request.headers.get("x-offline-grant") ?? request.headers.get("x-grant-token") ?? null;
  const grantId =
    request.headers.get("x-grant-id") ?? request.headers.get("x-offline-grant-id") ?? null;
  const cuarentena =
    request.headers.get("x-cuarentena") ?? request.headers.get("x-offline-cuarentena") ?? null;
  const deviceCode = request.headers.get("x-device-code") ?? null;

  if (cuarentena === "1" || cuarentena === "true" || cuarentena === "si") {
    return respuesta403("Necesita conexión: dispositivo en cuarentena. Revalidá online.", "cuarentena_revalidar_online", {
      ...(alcance !== undefined ? { alcance } : {}),
    });
  }

  // Grant id explícito: si revocado => cuarentena con mensaje específico.
  if (grantId) {
    const g = control.offlineGrants.get(grantId);
    if (g?.revocadoEn) {
      return respuesta403("Grant revocado: revalidá online antes de operar.", "grant_revocado", {
        ...(alcance !== undefined ? { alcance } : {}),
        grant_id: grantId,
      });
    }
    // Aunque vigente, lo sensible nunca va offline.
    return respuesta403("Operación sensible: necesita conexión. No disponible con grant offline.", "sensible_solo_online", {
      ...(alcance !== undefined ? { alcance } : {}),
    });
  }

  // Token JWT presente => intento offline de sensible.
  if (grantToken) {
    return respuesta403("Operación sensible: necesita conexión. No disponible con grant offline.", "sensible_solo_online", {
      ...(alcance !== undefined ? { alcance } : {}),
    });
  }

  // Device en cuarentena (>=72h sin sync) o con grant revocado => 403.
  if (deviceCode) {
    const ds = store.deviceSync.get(deviceCode);
    if (ds) {
      const horas = horasSinSync(ds.ultimaVistaEn, new Date());
      if (enCuarentena(horas)) {
        return respuesta403("Necesita conexión: dispositivo en cuarentena. Revalidá online.", "cuarentena_revalidar_online", {
          ...(alcance !== undefined ? { alcance } : {}),
          device_code: deviceCode,
        });
      }
    }
    for (const g of control.offlineGrants.values()) {
      if (g.deviceCode === deviceCode && g.revocadoEn) {
        return respuesta403("Grant revocado: revalidá online antes de operar.", "grant_revocado", {
          ...(alcance !== undefined ? { alcance } : {}),
          device_code: deviceCode,
        });
      }
    }
  }

  return null;
}
