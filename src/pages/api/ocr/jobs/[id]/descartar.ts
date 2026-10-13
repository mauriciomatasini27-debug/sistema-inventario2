import type { APIRoute } from "astro";
import { ocrDescartarSchema } from "../../../../../lib/validation.js";
import { store } from "../../../../../lib/store.js";
import { descartarBorrador } from "../../../../../modules/purchases/facturas.js";

export const prerender = false;

// POST /api/ocr/jobs/:id/descartar — cierra sin registrar. 200, 409 resuelto,
// 410 vencido (solo lectura).
export const POST: APIRoute = async ({ request, params }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = ocrDescartarSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const job = store.ocrJobs.get(params.id ?? "");
  if (!job || !job.borradorId) return Response.json({ error: "job inexistente" }, { status: 404 });
  const borrador = store.borradores.get(job.borradorId);
  if (!borrador) return Response.json({ error: "borrador inexistente" }, { status: 404 });
  const r = descartarBorrador(borrador, new Date().toISOString());
  if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
  store.borradores.set(borrador.id, r.borrador);
  store.borradorVistos.set(borrador.idempotencyKey, r.borrador);
  store.ocrEventos.push({
    tipo: "ocr_descartado",
    payload: { job_id: job.id, motivo: parsed.data.motivo ?? "sin_motivo" },
  });
  return Response.json({ borrador_id: r.borrador.id, estado: "descartada" }, { status: 200 });
};
