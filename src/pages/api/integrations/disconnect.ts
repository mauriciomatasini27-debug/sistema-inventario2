import type { APIRoute } from "astro";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import {
  descifrarRefreshTokenGmail,
  marcarConexionGmail,
} from "../../../lib/repos/google-conexiones.js";
import { revocarTokenGoogle } from "../../../modules/integraciones/google-oauth.js";
import { detenerWatchGmail } from "../../../jobs/gmail.js";

export const prerender = false;

// POST /api/integrations/disconnect — solo Dueño. Primero corta el acceso en
// Google y después borra el material local; si Google falla, igual revoca acá
// y avisa que la revocación remota quedó pendiente.
export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;

  try {
    await detenerWatchGmail({ tenantId: dueno.tenantId });
  } catch (e) {
    console.warn(
      "[integraciones] no se pudo detener el watch de Gmail:",
      e instanceof Error ? e.message : "error",
    );
  }

  let token: string | null = null;
  let revocadoEnGoogle = true;
  try {
    token = await descifrarRefreshTokenGmail(dueno.tenantId);
  } catch (e) {
    revocadoEnGoogle = false;
    console.warn(
      "[integraciones] no se pudo descifrar el token:",
      e instanceof Error ? e.message : "error",
    );
  }
  if (token) {
    try {
      await revocarTokenGoogle(token);
    } catch (e) {
      revocadoEnGoogle = false;
      console.warn(
        "[integraciones] Google no revocó el token:",
        e instanceof Error ? e.message : "error",
      );
    }
  }

  await marcarConexionGmail({
    tenantId: dueno.tenantId,
    estado: "revocada",
    evento: "desconectada",
    motivo: revocadoEnGoogle ? "usuario" : "revocacion_google_fallida",
    actor: dueno.ctx.googleSub,
  });

  return Response.json(
    { ok: true, revocado_en_google: revocadoEnGoogle },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
};
