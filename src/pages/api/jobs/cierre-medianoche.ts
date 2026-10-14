import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { correrCierreMedianoche } from "../../../lib/repos/caja.js";

export const prerender = false;

// POST /api/jobs/cierre-medianoche — cierre automático (cron 00:05
// America/Argentina/Buenos_Aires, fuera del repo). Solo con X-Job-Secret.
// Idempotente por jornada (409 el segundo disparo); 422 si hay turno en
// disputa; tras el cierre asegura el aviso WA C10 una sola vez.
// PERS2-S18: el tenant sale de gateJob y el cierre persiste por el repo caja.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async () => {
    const r = await correrCierreMedianoche(new Date());
    if (r.status === 201) {
      return Response.json(
        { fecha_jornada: r.fechaJornada, close_type: "automatica", total_centavos: r.totalCentavos, wa: r.wa },
        { status: 201 },
      );
    }
    if (r.status === 409) {
      return Response.json(
        { error: r.error, fecha_jornada: r.fechaJornada, close_type: "automatica", total_centavos: r.totalCentavos, wa: r.wa },
        { status: 409 },
      );
    }
    return Response.json({ error: r.error }, { status: 422 });
  });
};
