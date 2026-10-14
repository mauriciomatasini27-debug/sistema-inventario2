import type { APIRoute } from "astro";
import { gateJob } from "../../../lib/tenant-context.js";
import { conTenant, esModoMulti } from "../../../lib/tenant-mode.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { listarCuentas, listarFacturas } from "../../../lib/repos/servicios.js";
import { listarOrdenesJob, persistirOrdenesVencidas } from "../../../lib/repos/ordenes-pago.js";
import { listarComerciosBot, obtenerComercioBot, waEnviadosVivos } from "../../../lib/repos/whatsapp.js";
import { ejecutar_vencimientos_servicios } from "../../../jobs/vencimientos-servicios.js";
import { cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";
import { fechaAR } from "../../../lib/fecha-ar.js";

export const prerender = false;

// POST /api/jobs/vencimientos-servicios — recordatorios CS12/OP11.
// Cron diario 03:00 America/Argentina/Buenos_Aires, fuera del repo.
// Solo con X-Job-Secret. Por comercio con bot: marca órdenes vencidas,
// recuerda servicios (3d + vencidas) y órdenes (7d + vencidas) por WA
// una vez por día, con opt-in/pausa. Sin credenciales WA los envíos se
// informan como fallo sin quemar idempotencia (reintentan mañana).
// Nada se paga ni prepara solo: las sugerencias viajan en la respuesta.
// PERS2-S19: el tenant sale de gateJob (en multi solo ese comercio; en
// single todos como hoy); facturas y cuentas van por el repo servicios y
// las órdenes por el repo ordenes-pago.
export const POST: APIRoute = async ({ request }) => {
  const g = gateJob(request);
  if (!g) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  if (!g.ok) return g.respuesta;
  return conTenant(g.tenantId, async () => {
    const ahoraMs = Date.now();
    const hoyIso = fechaAR(new Date(ahoraMs));
    const hayCred = cred_wa() !== null;
    let cuentas: Awaited<ReturnType<typeof listarCuentas>>;
    let facturas: Awaited<ReturnType<typeof listarFacturas>>;
    let ordenes: Awaited<ReturnType<typeof listarOrdenesJob>>;
    try {
      cuentas = await listarCuentas();
      facturas = await listarFacturas();
      ordenes = await listarOrdenesJob();
    } catch (e) {
      if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
      throw e;
    }
    const uno = obtenerComercioBot(g.tenantId);
    const comercios = esModoMulti() ? (uno ? [uno] : []) : listarComerciosBot();
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
      try {
        await persistirOrdenesVencidas({ actualizadas: r.ordenes, vencidasIds: r.vencidasMarcadas, hoyMs: ahoraMs });
      } catch (e) {
        if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
        throw e;
      }
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
