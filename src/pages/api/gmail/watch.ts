import type { APIRoute } from "astro";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import { renovarWatchGmail } from "../../../jobs/gmail.js";
import { CasillaEnOtroComercio } from "../../../lib/repos/gmail-watch.js";
import { ErrorGmail } from "../../../modules/integraciones/gmail-cliente.js";
import { ErrorOAuthGoogle } from "../../../modules/integraciones/google-oauth.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;

  try {
    const r = await renovarWatchGmail({ tenantId: dueno.tenantId });
    return Response.json(
      { ok: true, history_id: r.historyId, expira_at: r.expiraAt.toISOString() },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof CasillaEnOtroComercio) {
      return Response.json({ error: "casilla_en_otro_comercio" }, { status: 409 });
    }
    if (e instanceof ErrorOAuthGoogle) {
      if (e.codigo === "sin_conexion") {
        return Response.json({ error: "sin_conexion" }, { status: 409 });
      }
      return Response.json({ error: "integracion_no_configurada" }, { status: 503 });
    }
    if (e instanceof ErrorGmail) {
      return Response.json({ error: "gmail_no_disponible" }, { status: 502 });
    }
    throw e;
  }
};
