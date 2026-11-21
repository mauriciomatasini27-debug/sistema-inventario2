import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { proveedorEmailDesdeEnv } from "../../../lib/email-resend.js";
import { enviarEmailsDelComercio } from "../../../jobs/enviar-emails.js";

export const prerender = false;

// POST /api/jobs/enviar-emails — P10-92. Manda lo pendiente de email_outbox.
// Solo con X-Job-Secret vía correrJob (fan-out por comercio en multi/shared).
// Sin RESEND_API_KEY y EMAIL_FROM responde "sin_proveedor" y no toca la cola.
// No está agendado: el cron vive fuera y pega a este endpoint.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async () => {
    const proveedor = proveedorEmailDesdeEnv();
    if (!proveedor) return Response.json({ omitido: "sin_proveedor" }, { status: 200 });
    const r = await enviarEmailsDelComercio(proveedor, new Date());
    if (!r) return Response.json({ omitido: "sin_base" }, { status: 200 });
    return Response.json(r, { status: 200 });
  });
};
