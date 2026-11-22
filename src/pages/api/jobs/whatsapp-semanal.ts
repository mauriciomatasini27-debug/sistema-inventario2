import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { esModoAisladoPorTenant } from "../../../lib/tenant-mode.js";
import { calculoSemanalMemoria, calculoSemanalVivo, listarComerciosBot, obtenerComercioBot } from "../../../lib/repos/whatsapp.js";
import { reclamadorDb } from "../../../lib/repos/notification-deliveries.js";
import type { CalculoSemanal } from "../../../modules/email/resumen-semanal.js";
import { ejecutar_job_viernes, type Enviador } from "../../../jobs/whatsapp-resumen.js";
import { PLANTILLA_RESUMEN_SEMANAL } from "../../../modules/whatsapp/resumen-semanal.js";
import { encolar_email_simple, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";

export const prerender = false;

export function semana_iso(fecha: Date): string {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const ano = d.getUTCFullYear();
  const semana = 1 + Math.round((d.getTime() - Date.UTC(ano, 0, 4)) / (7 * 86400000));
  return `${ano}-W${String(semana).padStart(2, "0")}`;
}

export function calculo_vivo(): CalculoSemanal {
  return calculoSemanalMemoria();
}

export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const ahoraMs = Date.now();
    const semanaISO = semana_iso(new Date(ahoraMs));
    const calculo = await calculoSemanalVivo();
    const baseWeb = process.env.PUBLIC_APP_URL ?? "https://app.local";
    const sender: Enviador = async ({ canal, destino, texto, idempotencyKey }) => {
      if (canal === "wa") return enviar_texto_wa(destino, texto, { nombrePlantilla: PLANTILLA_RESUMEN_SEMANAL });
      return encolar_email_simple(idempotencyKey, destino, `Resumen semanal ${semanaISO}`, texto);
    };
    const uno = obtenerComercioBot(tenantId);
    const comercios = esModoAisladoPorTenant() ? (uno ? [uno] : []) : listarComerciosBot();
    const resultados = [];
    for (const c of comercios) {
      const email = control.users.get(c.googleSub)?.email ?? "";
      const tiendas = {
        wa: reclamadorDb(c.tenantId, c.googleSub, "whatsapp"),
        email: reclamadorDb(c.tenantId, c.googleSub, "email"),
      };
      const r = await ejecutar_job_viernes(tiendas, sender, {
        comercio: {
          tenantId: c.tenantId,
          nombreComercio: c.nombreComercio,
          zona: "America/Argentina/Buenos_Aires",
          prefsWa: c.prefs,
          prefsEmail: { resumenCierre: true, pausadoHastaMs: null },
          destinoWa: c.numero,
          destinoEmail: email,
        },
        semanaISO,
        calculo,
        // B15: sin motor de promos en slice-0 (llega con rotación RT9); el
        // resumen sale sin bloque de promos.
        promos: [],
        baseWeb,
        ahoraMs,
      });
      resultados.push({ tenant_id: c.tenantId, canales: r });
    }
    return Response.json({ semana: semanaISO, resultados }, { status: 200 });
  });
};
