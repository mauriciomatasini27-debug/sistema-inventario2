import type { APIRoute } from "astro";
import { ocrConfirmarSchema } from "../../../../../lib/validation.js";
import { store } from "../../../../../lib/store.js";
import { confirmarBorrador } from "../../../../../modules/purchases/facturas.js";

export const prerender = false;

// POST /api/ocr/jobs/:id/confirmar — ÚNICO camino que registra factura (toque
// explícito). 201 con factura_id, 409 resuelto, 410 vencido, 422 E1.
// Nada se registra sin este toque.
export const POST: APIRoute = async ({ request, params }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = ocrConfirmarSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const job = store.ocrJobs.get(params.id ?? "");
  if (!job || !job.borradorId) return Response.json({ error: "job inexistente" }, { status: 404 });
  const borrador = store.borradores.get(job.borradorId);
  if (!borrador) return Response.json({ error: "borrador inexistente" }, { status: 404 });
  const r = confirmarBorrador(borrador, { quien: parsed.data.quien, ahoraIso: new Date().toISOString() });
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  store.borradores.set(borrador.id, r.borrador);
  store.borradorVistos.set(borrador.idempotencyKey, r.borrador);
  store.facturasProv.set(r.factura.id, r.factura);
  store.ocrEventos.push({
    tipo: "ocr_confirmado",
    payload: { job_id: job.id, factura_id: r.factura.id, confirmado_por: parsed.data.quien },
  });
  return Response.json(
    { factura_id: r.factura.id, total_centavos: r.factura.totalCentavos.toString(), aviso_revisar: r.avisoRevisar },
    { status: 201 },
  );
};
