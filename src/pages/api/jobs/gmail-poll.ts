import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { ejecutarJobGmail, renovarWatchGmail } from "../../../jobs/gmail.js";
import { encolarPolling } from "../../../lib/repos/gmail-cola.js";
import { listarConexionesGmail } from "../../../lib/repos/google-conexiones.js";

export const prerender = false;

const DOCE_HORAS_MS = 12 * 60 * 60 * 1000;

export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const conexiones = await listarConexionesGmail(tenantId);
    const resultados = [];
    for (const conexion of conexiones) {
      if (conexion.estado !== "activa") continue;
      const avisos: string[] = [];
      if (
        conexion.watchExpiraAt === null ||
        conexion.watchExpiraAt.getTime() <= Date.now() + DOCE_HORAS_MS
      ) {
        try {
          await renovarWatchGmail({ tenantId, connectionId: conexion.id });
        } catch (e) {
          avisos.push(`watch: ${e instanceof Error ? e.message : "error"}`);
        }
      }
      const job = await encolarPolling({
        tenantId,
        connectionId: conexion.id,
        cursor: conexion.gmailHistoryCursor,
      });
      const estado = await ejecutarJobGmail(job);
      resultados.push({ connection_id: conexion.id, estado, avisos });
    }
    return Response.json({ total: resultados.length, resultados }, { status: 200 });
  });
};
