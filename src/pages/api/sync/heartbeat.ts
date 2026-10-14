import type { APIRoute } from "astro";
import { syncHeartbeatSchema } from "../../../lib/validation.js";
import { control } from "../../../lib/store.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { persistirDeviceSync } from "../../../lib/control-db.js";
import { guardarLatido, leerLatidoPrevio } from "../../../lib/repos/sync.js";
import { enCuarentena, horasSinSync, nivelAviso } from "../../../offline/avisos.js";

export const prerender = false;

// POST /api/sync/heartbeat — SYNC-S3/S4 (PRD-SYNC-01, OF5/OF12/OF14).
// Registra device_sync_state (última vista + pendientes + última op) y devuelve
// estado del indicador + aviso por antigüedad (24h/60h/72h cuarentena).
// PWA-S5: si el device está bloqueado/revocado => wipe:true para borrado remoto.
// PERS2-S22: estado por dispositivo por el repo de sync (ADR-0061); en multi
// sin base propaga BaseNoDisponible y responde 503.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = syncHeartbeatSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const ahora = new Date().toISOString();
  const previo = leerLatidoPrevio(parsed.data.device_code);
  const horasPrevio = previo ? horasSinSync(previo.ultimaVistaEn, new Date(ahora)) : 0;
  const nivelPrevio = nivelAviso(horasPrevio);
  try {
    await guardarLatido({
      deviceCode: parsed.data.device_code,
      ultimaVistaEn: ahora,
      pendientes: parsed.data.pendientes,
      ultimaOpHlc: parsed.data.ultima_op_hlc ?? null,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  void persistirDeviceSync({
    deviceCode: parsed.data.device_code,
    ultimaVistaEn: ahora,
    pendientes: parsed.data.pendientes,
    ultimaOpHlc: parsed.data.ultima_op_hlc ?? null,
  });

  const pendientes = parsed.data.pendientes;
  const cuarentena = enCuarentena(horasPrevio);
  const estado = cuarentena ? "rojo" : pendientes === 0 ? "verde" : "ambar";
  const aviso =
    nivelPrevio === null
      ? null
      : { nivel: nivelPrevio, horas: Math.round(horasPrevio * 10) / 10, cuarentena };
  // PWA-S5 wipe: device bloqueado o con grant revocado => el cliente debe borrar local.
  const wipe = [...control.offlineGrants.values()].some(
    (g) => g.deviceCode === parsed.data.device_code && g.revocadoEn,
  );
  const revocado = control.deviceLocks.get(parsed.data.device_code)?.bloqueado ?? false;
  return Response.json(
    {
      device_code: parsed.data.device_code,
      ultima_vista_en: ahora,
      pendientes,
      estado,
      aviso,
      wipe: wipe || revocado,
    },
    { status: 200 },
  );
};
