import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { cred_wa, id_plantilla_aprobada } from "../../../jobs/whatsapp-adaptador.js";
import { enviar_whatsapp } from "../../../modules/whatsapp/cliente-cloud.js";
import { duenoAviso, enviarAvisosWhatsappDelComercio } from "../../../jobs/enviar-avisos-whatsapp.js";

export const prerender = false;

// WA-AVISOS-1: POST /api/jobs/enviar-avisos-whatsapp: manda por WhatsApp (plantillas de
// Meta) los avisos de cuenta encolados en email_outbox. Solo con X-Job-Secret;
// el fan-out incluye comercios cerrados. Sin WHATSAPP_TOKEN y
// WHATSAPP_PHONE_NUMBER_ID responde "sin_credenciales" y no toca la cola.
// No está agendado: el cron vive fuera y pega a este endpoint.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(
    request,
    async () => {
      const cred = cred_wa();
      if (!cred) return Response.json({ omitido: "sin_credenciales" }, { status: 200 });
      const r = await enviarAvisosWhatsappDelComercio(
        {
          dueno: duenoAviso,
          aprobada: (nombre) => id_plantilla_aprobada(nombre) !== null,
          enviar: (toE164, payload) => enviar_whatsapp({ ...cred, toE164, payload }),
        },
        new Date(),
      );
      if (!r) return Response.json({ omitido: "sin_base" }, { status: 200 });
      return Response.json(r, { status: 200 });
    },
    { incluirCerrados: true },
  );
};
