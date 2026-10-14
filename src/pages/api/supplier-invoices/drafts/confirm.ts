import type { APIRoute } from "astro";
import { draftResolveSchema } from "../../../../lib/validation.js";
import { BaseNoDisponible } from "../../../../lib/server-db.js";
import { confirmarBorradorRepo } from "../../../../lib/repos/facturas-proveedor.js";

export const prerender = false;

// POST /api/supplier-invoices/drafts/confirm — confirma 1 toque (E1/E5).
// ÚNICO camino que registra factura; alimenta cost_history vía descriptores.
// PERS2-S14: el repo es dueño de factura + borrador + match log + cierre OC.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = draftResolveSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const ahoraIso = new Date().toISOString();
  try {
    const r = await confirmarBorradorRepo({ draftId: b.draft_id, quien: b.quien, ahoraIso });
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
