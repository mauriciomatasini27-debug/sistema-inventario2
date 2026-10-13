import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { draftResolveSchema } from "../../../../lib/validation.js";
import { descartarBorrador } from "../../../../modules/purchases/facturas.js";
import { store } from "../../../../lib/store.js";
import { dbViva, leerBorradorPorId } from "../../../../lib/compras-db.js";
import { supplierDrafts } from "../../../../db/schema-proveedores.js";

export const prerender = false;

// POST /api/supplier-invoices/drafts/discard — descarta borrador pendiente.
// PERS-S4: DB-first. Con memoria fría se reconstruye desde la fila; el descarte
// persiste UPDATE con espejo. Sin DB o ante error, memoria como antes.
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

  const enMemoria = store.borradores.get(b.draft_id);
  const db = dbViva();
  if (!db) {
    if (!enMemoria) return Response.json({ error: "borrador inexistente" }, { status: 404 });
    const r = descartarBorrador(enMemoria, ahoraIso);
    if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
    store.borradores.set(b.draft_id, r.borrador);
    return Response.json({ draft_id: r.borrador.id, estado: r.borrador.estado });
  }

  try {
    const base = enMemoria ?? (await leerBorradorPorId(db, b.draft_id))?.borrador ?? null;
    if (!base) return Response.json({ error: "borrador inexistente" }, { status: 404 });
    const r = descartarBorrador(base, ahoraIso);
    if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
    await db
      .update(supplierDrafts)
      .set({ estado: r.borrador.estado })
      .where(eq(supplierDrafts.idempotencyKey, r.borrador.idempotencyKey));
    store.borradores.set(r.borrador.id, r.borrador);
    store.borradorVistos.set(r.borrador.idempotencyKey, r.borrador);
    return Response.json({ draft_id: r.borrador.id, estado: r.borrador.estado, fuente: "db" });
  } catch {
    if (!enMemoria) return Response.json({ error: "borrador inexistente" }, { status: 404 });
    const r = descartarBorrador(enMemoria, ahoraIso);
    if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
    store.borradores.set(b.draft_id, r.borrador);
    return Response.json({ draft_id: r.borrador.id, estado: r.borrador.estado });
  }
};
