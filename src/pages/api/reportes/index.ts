import type { APIRoute } from "astro";
import { crearReporte, listarReportesPropios } from "../../../modules/reportes-comercio/repo.js";
import { cuerpoCrearReporte } from "../../../modules/reportes-comercio/validacion.js";
import { exigirMiembroComercio } from "../../../modules/reportes-comercio/sesion.js";
import { jsonError } from "../../../lib/control.js";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const gate = exigirMiembroComercio(request);
  if (!gate.ok) return gate.respuesta;
  const items = listarReportesPropios(gate.tenantId, gate.ctx.googleSub).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    texto: r.texto,
    estado: r.estado,
    contexto: r.contexto,
    creado_en: r.creadoEn,
    actualizado_en: r.actualizadoEn,
  }));
  return Response.json({ items });
};

export const POST: APIRoute = async ({ request }) => {
  const gate = exigirMiembroComercio(request);
  if (!gate.ok) return gate.respuesta;

  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key || key.length > 120) {
    return jsonError("Falta Idempotency-Key para registrar el envío.", 422);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }

  const parsed = cuerpoCrearReporte.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Datos inválidos.";
    return jsonError(msg, 422);
  }

  const b = parsed.data;
  const r = await crearReporte({
    tenantId: gate.tenantId,
    googleSub: gate.ctx.googleSub,
    idempotencyKey: key,
    tipo: b.tipo,
    texto: b.texto,
    ...(b.ruta_sugerida !== undefined ? { rutaSugerida: b.ruta_sugerida } : {}),
    ...(b.pantalla !== undefined ? { pantallaCliente: b.pantalla } : {}),
    referer: request.headers.get("Referer"),
  });

  if (!r.ok) {
    if (r.codigo === "rate_limit") return jsonError(r.mensaje, 429);
    return jsonError(r.mensaje, 422);
  }

  return Response.json(
    {
      id: r.reporte.id,
      estado: r.reporte.estado,
      reintento: r.reintento,
      contexto: r.reporte.contexto,
    },
    { status: r.reintento ? 200 : 201 },
  );
};
