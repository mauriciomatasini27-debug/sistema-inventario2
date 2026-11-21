import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { esModoAisladoPorTenant } from "../../../lib/tenant-mode.js";
import { listarCuentas, listarFacturas } from "../../../lib/repos/servicios.js";
import { listarOrdenesJob, persistirOrdenesVencidas } from "../../../lib/repos/ordenes-pago.js";
import { listarComerciosBot, obtenerComercioBot, waEnviadosVivos } from "../../../lib/repos/whatsapp.js";
import { ejecutar_vencimientos_servicios } from "../../../jobs/vencimientos-servicios.js";
import { cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";
import { fechaAR } from "../../../lib/fecha-ar.js";

export const prerender = false;

// POST /api/jobs/vencimientos-servicios — recordatorios CS12/OP11.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const ahoraMs = Date.now();
    const hoyIso = fechaAR(new Date(ahoraMs));
    const hayCred = cred_wa() !== null;
    const cuentas = await listarCuentas();
    const facturas = await listarFacturas();
    let ordenes = await listarOrdenesJob();
    const uno = obtenerComercioBot(tenantId);
    const comercios = esModoAisladoPorTenant() ? (uno ? [uno] : []) : listarComerciosBot();
    const yaEnviados = waEnviadosVivos();
    const resultados = [];
    for (const comercio of comercios) {
      const r = ejecutar_vencimientos_servicios({
        comercio: { tenantId: comercio.tenantId, nombreComercio: comercio.nombreComercio, prefs: comercio.prefs },
        facturas,
        ordenes,
        cuentas,
        hoyIso,
        hoyMs: ahoraMs,
        yaEnviados,
        enviar: (texto: string): boolean => {
          if (!hayCred) return false;
          void enviar_texto_wa(comercio.numero, texto);
          return true;
        },
      });
      await persistirOrdenesVencidas({ actualizadas: r.ordenes, vencidasIds: r.vencidasMarcadas, hoyMs: ahoraMs });
      ordenes = [...r.ordenes];
      resultados.push({
        tenant_id: comercio.tenantId,
        vencidas_marcadas: r.vencidasMarcadas,
        recordatorios: r.recordatorios.map((x) => ({ tipo: x.tipo, estado: x.estado })),
        sugerencias: r.sugerencias,
      });
    }
    return Response.json({ fecha: hoyIso, resultados }, { status: 200 });
  });
};
