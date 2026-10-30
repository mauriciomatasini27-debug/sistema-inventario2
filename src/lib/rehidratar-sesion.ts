import { leerSesionDb } from "./control-db.js";
import { control } from "./store.js";
import { extraerSesionDeCookie, sha256Hex } from "../modules/auth/sesiones.js";

// P1-23: la cookie sobrevive al salto de instancia; el Map no. Trae la fila
// a memoria antes de que resolverSesion (síncrono) decida el 403.
export async function rehidratarSesion(request: Request): Promise<void> {
  const idPlano = extraerSesionDeCookie(request.headers.get("cookie"));
  if (!idPlano) return;
  const idHash = sha256Hex(idPlano);
  if (control.sessions.has(idHash)) return;
  const row = await leerSesionDb(idHash);
  if (!row || !row.googleSub || row.revocadaAt) return;
  control.sessions.set(idHash, {
    idHash: row.idHash,
    googleSub: row.googleSub,
    tenantId: row.tenantId,
    expiraAt: row.expiraAt,
    ...(row.expiraAbsoluta ? { expiraAbsoluta: row.expiraAbsoluta } : {}),
    ...(row.lastSeenAt ? { lastSeenAt: row.lastSeenAt } : {}),
    ...(row.revocadaAt ? { revocadaAt: row.revocadaAt } : {}),
    ...(row.motivo ? { motivo: row.motivo } : {}),
    ...(row.reauthAt ? { reauthAt: row.reauthAt } : {}),
  });
}
