import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { renovarWatchGmail } from "../../../jobs/gmail.js";
import { listarConexionesGmail } from "../../../lib/repos/google-conexiones.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const conexiones = await listarConexionesGmail(tenantId);
    const resultados = [];
    for (const conexion of conexiones) {
      if (conexion.estado !== "activa") {
        resultados.push({ connection_id: conexion.id, estado: "omitida" });
        continue;
      }
      try {
        const r = await renovarWatchGmail({ tenantId, connectionId: conexion.id });
        resultados.push({
          connection_id: conexion.id,
          estado: "renovado",
          history_id: r.historyId,
          expira_at: r.expiraAt.toISOString(),
        });
      } catch (e) {
        resultados.push({
          connection_id: conexion.id,
          estado: "error",
          motivo: e instanceof Error ? e.message : "error",
        });
      }
    }
    return Response.json({ total: resultados.length, resultados }, { status: 200 });
  });
};
