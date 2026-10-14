import type { APIRoute } from "astro";
import { gateJob } from "../../../lib/tenant-context.js";
import { conTenant } from "../../../lib/tenant-mode.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { correrCierreMedianoche } from "../../../lib/repos/caja.js";

export const prerender = false;

// POST /api/jobs/cierre-medianoche — cierre automático (cron 00:05
// America/Argentina/Buenos_Aires, fuera del repo). Solo con X-Job-Secret.
// Idempotente por jornada (409 el segundo disparo); 422 si hay turno en
// disputa; tras el cierre asegura el aviso WA C10 una sola vez.
// PERS2-S18: el tenant sale de gateJob y el cierre persiste por el repo caja.
export const POST: APIRoute = async ({ request }) => {
  const g = gateJob(request);
  if (!g) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  if (!g.ok) return g.respuesta;
  return conTenant(g.tenantId, async () => {
    let r: Awaited<ReturnType<typeof correrCierreMedianoche>>;
    try {
      r = await correrCierreMedianoche(new Date());
    } catch (e) {
      if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
      throw e;
    }
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
