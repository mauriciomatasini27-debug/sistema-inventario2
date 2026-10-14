import type { APIRoute } from "astro";
import { draftResolveSchema } from "../../../../lib/validation.js";
import { BaseNoDisponible } from "../../../../lib/server-db.js";
import { descartarBorradorRepo } from "../../../../lib/repos/facturas-proveedor.js";

export const prerender = false;

// POST /api/supplier-invoices/drafts/discard — descarta borrador pendiente.
// PERS2-S14: el repo es dueño del descarte con espejo memoria.
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
    const r = await descartarBorradorRepo({ draftId: b.draft_id, ahoraIso });
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
