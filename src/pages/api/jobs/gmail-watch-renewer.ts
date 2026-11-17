import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { renovarWatchGmail } from "../../../jobs/gmail.js";
import { listarConexionesGmail } from "../../../lib/repos/google-conexiones.js";

export const prerender = false;

// GGL-P0-HUECOS: Scheduler del watch cada 24h
// Cron: 0 6 * * * = 6:00 UTC diario
// Renueva el watch si está por expirar (<12h de vida), sin procesar ingesta.
// Este job es independiente del job de polling (gmail-poll.ts) que procesa los mensajes.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const conexiones = await listarConexionesGmail(tenantId);
    const resultados: Array<{
      connection_id: string;
      watchExpiraAt: string | null;
      renovado: boolean;
      aviso: string | null;
    }> = [];

    for (const conexion of conexiones) {
      if (conexion.estado !== "activa") continue;
      if (!conexion.watchExpiraAt) {
        // Sin watch programado: intentar renovarlo
        try {
          const { expiraAt } = await renovarWatchGmail({ tenantId, connectionId: conexion.id });
          resultados.push({
            connection_id: conexion.id,
            watchExpiraAt: expiraAt.toISOString(),
            renovado: true,
            aviso: null,
          });
        } catch (e) {
          resultados.push({
            connection_id: conexion.id,
            watchExpiraAt: null,
            renovado: false,
            aviso: e instanceof Error ? e.message : "error",
          });
        }
        continue;
      }

      const ahora = Date.now();
      const faltaParaVencer = conexion.watchExpiraAt.getTime() - ahora;
      // Renovar si quedan menos de 12 horas (43200000 ms)
      if (faltaParaVencer < 12 * 60 * 60 * 1000) {
        try {
          const { expiraAt } = await renovarWatchGmail({ tenantId, connectionId: conexion.id });
          resultados.push({
            connection_id: conexion.id,
            watchExpiraAt: expiraAt.toISOString(),
            renovado: true,
            aviso: null,
          });
        } catch (e) {
          resultados.push({
            connection_id: conexion.id,
            watchExpiraAt: null,
            renovado: false,
            aviso: e instanceof Error ? e.message : "error",
          });
        }
      } else {
        // Watch aún vigente, no hacer nada
        resultados.push({
          connection_id: conexion.id,
          watchExpiraAt: conexion.watchExpiraAt.toISOString(),
          renovado: false,
          aviso: null,
        });
      }
    }

    const body = {
      total: resultados.length,
      renovados: resultados.filter((r) => r.renovado).length,
      resultados,
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
};