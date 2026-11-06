import type { APIRoute } from "astro";
import { syncPullQuerySchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { leerLote } from "../../../lib/repos/sync.js";

export const prerender = false;

// GET /api/sync/pull?cursor=0&limite=50 — SYNC-S1 (PRD-SYNC-01, ADR-0023).
// PERS-S2: DB-first sobre outbox con el mismo paginado por offset; con base
// viva el catálogo (stock, prices y codes) sale de products y product_codes (ADR-0081, P1-58).
// Sin DB o ante error, la vía memoria histórica resuelve igual que antes.
// cursor = offset de inserción; limite cap 50 por PRD aunque el schema admite 200.
// Responde lote + cursor_nuevo + mappings provisorio->definitivo + catálogo mínimo.
// PERS2-S22: lote y mapeos por el repo de sync (ADR-0061); en multi sin base
// propaga BaseNoDisponible y responde 503.

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const parsed = syncPullQuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? "0",
    limite: url.searchParams.get("limite") ?? "50",
  });
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const limite = Math.min(parsed.data.limite, 50);
  const start = Number(parsed.data.cursor);
  if (!Number.isSafeInteger(start) || start < 0) {
    return Response.json({ error: "cursor inválido" }, { status: 422 });
  }

  try {
    const lote = await leerLote(start, limite);
    return Response.json(
      {
        movimientos: lote.movimientos,
        cursor_nuevo: lote.cursorNuevo,
        mappings: lote.mappings,
        catalogo: lote.catalogo,
        total: lote.total,
        ...(lote.fuente === "db" ? { fuente: "db" } : {}),
      },
      { status: 200 },
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
