import type { APIRoute } from "astro";
import { jsonError } from "../../../../lib/control.js";
import { exigirAdmin } from "../_guard.js";
import { listarReportesPlataforma } from "../../../../modules/reportes-comercio/repo.js";
import type { EstadoReporteComercio } from "../../../../lib/reportes-comercio-store.js";

export const prerender = false;

const ESTADOS: readonly EstadoReporteComercio[] = ["recibido", "en_revision", "resuelto"];

export const GET: APIRoute = async ({ request, url }) => {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;

  const filtro = url.searchParams.get("estado");
  let estado: EstadoReporteComercio | undefined;
  if (filtro) {
    if (!ESTADOS.includes(filtro as EstadoReporteComercio)) {
      return jsonError("Estado de filtro inválido.", 422);
    }
    estado = filtro as EstadoReporteComercio;
  }

  const items = listarReportesPlataforma(estado).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    estado: r.estado,
    nombre_comercio: r.nombreComercio,
    texto: r.texto,
    contexto: r.contexto,
    tenant_id: r.tenantId,
    creado_en: r.creadoEn,
    actualizado_en: r.actualizadoEn,
  }));
  return Response.json({ items });
};
