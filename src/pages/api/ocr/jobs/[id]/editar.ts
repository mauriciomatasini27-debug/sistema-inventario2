import type { APIRoute } from "astro";
import { ocrEditarSchema } from "../../../../../lib/validation.js";
import { store } from "../../../../../lib/store.js";
import { editarBorrador } from "../../../../../modules/purchases/facturas.js";

export const prerender = false;

// POST /api/ocr/jobs/:id/editar — corrección por texto (ej `monto 164800`).
// Lo editado por humano sube a confianza alta. 200 actualizado, 409 resuelto,
// 410 vencido, 422 campo inválido.
export const POST: APIRoute = async ({ request, params }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = ocrEditarSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const job = store.ocrJobs.get(params.id ?? "");
  if (!job || !job.borradorId) return Response.json({ error: "job inexistente" }, { status: 404 });
  const borrador = store.borradores.get(job.borradorId);
  if (!borrador) return Response.json({ error: "borrador inexistente" }, { status: 404 });
  const b = parsed.data;
  const r = editarBorrador(
    borrador,
    {
      ...(b.cuit_texto !== undefined ? { cuitTexto: b.cuit_texto } : {}),
      ...(b.nombre_proveedor !== undefined ? { nombreProveedor: b.nombre_proveedor } : {}),
      ...(b.fecha_texto !== undefined ? { fechaTexto: b.fecha_texto } : {}),
      ...(b.total_texto !== undefined ? { totalTexto: b.total_texto } : {}),
    },
    new Date().toISOString(),
  );
  if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
  store.borradores.set(borrador.id, r.borrador);
  store.borradorVistos.set(borrador.idempotencyKey, r.borrador);
  return Response.json(
    {
      borrador_id: r.borrador.id,
      total_centavos: r.borrador.totalCentavos?.toString() ?? null,
      confianza: r.borrador.confianza,
    },
    { status: 200 },
  );
};
