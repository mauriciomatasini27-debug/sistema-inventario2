import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { matchearBorradorRepo } from "../../../lib/repos/facturas-proveedor.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const draftId = (body as { draft_id?: unknown }).draft_id;
  if (typeof draftId !== "string" || !draftId) {
    return Response.json({ error: "falta draft_id" }, { status: 422 });
  }
  try {
    const r = await matchearBorradorRepo({ draftId });
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
