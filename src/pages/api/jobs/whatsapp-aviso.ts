import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { esModoMulti } from "../../../lib/tenant-mode.js";
import {
  alertasPreviasDelDia,
  catalogoAvisoVivo,
  listarComerciosBot,
  marcarWaEnviado,
  obtenerComercioBot,
  registrarAlertasStock,
  waEnviadosVivos,
} from "../../../lib/repos/whatsapp.js";
import { ejecutar_aviso_matutino_wa } from "../../../jobs/whatsapp-aviso-matutino.js";
import { fechaAR } from "../../../lib/fecha-ar.js";
import { cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";

export const prerender = false;

// POST /api/jobs/whatsapp-aviso — aviso matutino B5 por comercio.
// Solo con X-Job-Secret. Calcula con stock vivo al envío, solo si hay
// novedad y opt-in (B2/B5.1); el fallo de WA no bloquea el email (B5.6,
// el email sale por sus propios canales).
// Sin credenciales Cloud API el envío se registra como fallo (no se marca
// enviado). Con credenciales el envío se dispara y la entrega real vive en
// los webhooks de estado (B11.3).
// PERS2-S18: el tenant sale de gateJob (en multi solo ese comercio; en
// single todos como hoy) y el estado va por el repo whatsapp.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const ahoraMs = Date.now();
    const fecha = fechaAR(new Date(ahoraMs));
    const vivos = await catalogoAvisoVivo();
    const uno = obtenerComercioBot(tenantId);
    const comercios = esModoMulti() ? (uno ? [uno] : []) : listarComerciosBot();
    const porTenant = new Map(comercios.map((c) => [c.tenantId, c]));
    const comerciosWa = await Promise.all(
      comercios.map(async (c) => ({
        tenantId: c.tenantId,
        nombreComercio: c.nombreComercio,
        prefs: c.prefs,
        catalogoVivo: vivos,
        enAlertaPrevia: await alertasPreviasDelDia(c.tenantId, fecha),
      })),
    );
    const hayCred = cred_wa() !== null;
    const { resultados } = ejecutar_aviso_matutino_wa({
      comercios: comerciosWa,
      fecha,
      ahoraMs,
      yaEnviados: waEnviadosVivos(),
      enviar: (tenantId, payload) => {
        const dest = porTenant.get(tenantId);
        if (!dest || !hayCred) return { ok: false, error: dest ? "sin_credenciales" : "sin_destino" };
        void enviar_texto_wa(dest.numero, payload.texto);
        return { ok: true };
      },
      // Solo lo enviado bloquea la corrida del día: omitidos y fallos se
      // recalculan en el próximo intento (puede haber novedades o credenciales).
      registrar: (clave, r) => {
        if (r.estado === "enviado") marcarWaEnviado(clave);
      },
    });
    for (const r of resultados) {
      if (r.estado === "enviado") await registrarAlertasStock(r.tenantId, fecha, r.alertas);
    }
    return Response.json(
      {
        fecha,
        resultados: resultados.map((r) => ({ tenant_id: r.tenantId, estado: r.estado })),
      },
      { status: 200 },
    );
  });
};
