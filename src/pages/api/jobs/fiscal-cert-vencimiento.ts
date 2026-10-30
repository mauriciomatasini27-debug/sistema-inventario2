import type { APIRoute } from "astro";
import { ejecutar_alertas_certificado } from "../../../jobs/fiscal-cert-vencimiento.js";

export const prerender = false;

// POST /api/jobs/fiscal-cert-vencimiento — alertas 60/30/7 del certificado WSASS/prod (FE16.3).
// Cron diario fuera del repo. Solo con X-Job-Secret.
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const r = await ejecutar_alertas_certificado(new Date());
  return Response.json(r, { status: 200 });
};
