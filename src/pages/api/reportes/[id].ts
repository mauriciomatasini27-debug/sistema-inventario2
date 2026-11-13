import type { APIRoute } from "astro";
import { jsonError } from "../../../lib/control.js";
import { exigirMiembroComercio } from "../../../modules/reportes-comercio/sesion.js";
import { leerReporte, puedeLeerReporte } from "../../../modules/reportes-comercio/repo.js";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const gate = exigirMiembroComercio(request);
  if (!gate.ok) return gate.respuesta;
  const id = params.id ?? "";
  const r = await leerReporte(id);
  if (!r || !puedeLeerReporte(r, gate.tenantId, gate.ctx.googleSub)) {
    return jsonError("No encontramos ese envío.", 404);
  }
  return Response.json({
    id: r.id,
    tipo: r.tipo,
    texto: r.texto,
    estado: r.estado,
    contexto: r.contexto,
    creado_en: r.creadoEn,
    actualizado_en: r.actualizadoEn,
  });
};
