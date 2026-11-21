import type { APIRoute } from "astro";
import { emailCloseSummarySchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { encolarResumen, resumenMovimientosCaja } from "../../../lib/repos/email.js";

export const prerender = false;

// Reintento misma jornada => 409 (dedupe por tenant+fecha).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = emailCloseSummarySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let snapshot: Awaited<ReturnType<typeof resumenMovimientosCaja>>;
  try {
    snapshot = await resumenMovimientosCaja(b.tenant_id);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  const { total, porMedio } = snapshot;
  let r: Awaited<ReturnType<typeof encolarResumen>>;
  try {
    r = await encolarResumen({
      tenantId: b.tenant_id,
      cierreId: b.cierre_id,
      fechaJornada: b.fecha_jornada,
      totalCentavos: total,
      porMedio,
      tipo: b.tipo,
      datosPlantilla: {
        nombreComercio: b.nombre_comercio,
        fechaJornada: b.fecha_jornada,
        totalCentavos: total,
        porMedio,
        tipo: b.tipo,
      },
      destinatario: b.destinatario,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ asunto: r.envio.asunto, destinatario: r.envio.destinatario }, { status: 201 });
};
