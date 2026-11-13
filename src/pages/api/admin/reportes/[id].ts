import type { APIRoute } from "astro";
import { z } from "zod";
import { jsonError } from "../../../../lib/control.js";
import { exigirAdmin, exigirConfirmacion } from "../_guard.js";
import {
  cambiarEstadoReporte,
  leerReporte,
} from "../../../../modules/reportes-comercio/repo.js";
import { borradorIssueDesdeReporte } from "../../../../modules/reportes-comercio/export-issue.js";
import { cuerpoEstadoAdmin } from "../../../../modules/reportes-comercio/validacion.js";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;
  const id = params.id ?? "";
  const r = leerReporte(id);
  if (!r) return jsonError("No encontramos ese reporte.", 404);
  return Response.json({
    id: r.id,
    tipo: r.tipo,
    estado: r.estado,
    texto: r.texto,
    contexto: r.contexto,
    nombre_comercio: r.nombreComercio,
    tenant_id: r.tenantId,
    autor_google_sub: r.autorGoogleSub,
    creado_en: r.creadoEn,
    actualizado_en: r.actualizadoEn,
    borrador_issue: borradorIssueDesdeReporte(r),
  });
};

const patchEstado = z.object({
  accion: z.literal("estado"),
  estado: z.enum(["recibido", "en_revision", "resuelto"]),
  confirmo_id: z.string(),
  motivo: z.string(),
});

export const PATCH: APIRoute = async ({ request, params }) => {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;
  const id = params.id ?? "";
  const existente = leerReporte(id);
  if (!existente) return jsonError("No encontramos ese reporte.", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = patchEstado.safeParse(body);
  if (!parsed.success) return jsonError("Pedido inválido.", 422);
  const conf = cuerpoEstadoAdmin.safeParse(parsed.data);
  if (!conf.success) return jsonError(conf.error.issues[0]?.message ?? "Datos inválidos.", 422);

  const den = exigirConfirmacion(parsed.data as Record<string, unknown>, id);
  if (den instanceof Response) return den;

  const actualizado = cambiarEstadoReporte(id, conf.data.estado);
  if (!actualizado) return jsonError("No pudimos actualizar el estado.", 500);
  return Response.json({ id, estado: actualizado.estado });
};
