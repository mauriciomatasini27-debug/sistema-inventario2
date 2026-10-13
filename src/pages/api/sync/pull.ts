import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { syncPullQuerySchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { getTenantDb } from "../../../lib/db.js";
import { idMappings, outbox } from "../../../db/schema.js";

export const prerender = false;

// GET /api/sync/pull?cursor=0&limite=50 — SYNC-S1 (PRD-SYNC-01, ADR-0023).
// PERS-S2: DB-first sobre outbox con el mismo paginado por offset; el catálogo
// (stock/prices) sigue en memoria hasta su slice. Sin DB o ante error, la vía
// memoria histórica resuelve igual que antes.
// cursor = offset de inserción; limite cap 50 por PRD aunque el schema admite 200.
// Responde lote + cursor_nuevo + mappings provisorio->definitivo + catálogo mínimo.

type TenantDb = ReturnType<typeof getTenantDb>;

function dbViva(): TenantDb | null {
  try {
    return getTenantDb();
  } catch {
    return null;
  }
}

function viaMemoria(start: number, limite: number): Response {
  const entries = Array.from(store.outbox.entries());
  const page = entries.slice(start, start + limite);
  const movimientos = page.map(([op_id, payload]) => ({ op_id, payload }));
  const cursor_nuevo = String(start + page.length);

  const mappings = Array.from(store.promociones.entries()).map(([op_id, m]) => ({
    op_id,
    prov: m.provisorio,
    def: m.definitivo,
  }));

  const catalogo = {
    stock: Object.fromEntries(store.stock.entries()),
    prices: Object.fromEntries(store.prices.entries()),
  };

  return Response.json(
    { movimientos, cursor_nuevo, mappings, catalogo, total: store.outbox.size },
    { status: 200 },
  );
}

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

  const db = dbViva();
  if (!db) return viaMemoria(start, limite);

  try {
    const filas = await db
      .select()
      .from(outbox)
      .orderBy(outbox.createdAt, outbox.opId)
      .limit(limite)
      .offset(start);
    const totalFilas = await db.select({ n: sql`count(*)` }).from(outbox);
    const total = Number(totalFilas[0]?.n ?? 0);
    const mapas = await db.select().from(idMappings);

    const movimientos = filas.map((f) => ({ op_id: f.opId, payload: f.payload }));
    const mappings = mapas.map((m) => ({ op_id: m.opId, prov: m.idProvisorio, def: m.idDefinitivo }));
    const catalogo = {
      stock: Object.fromEntries(store.stock.entries()),
      prices: Object.fromEntries(store.prices.entries()),
    };

    return Response.json(
      { movimientos, cursor_nuevo: String(start + filas.length), mappings, catalogo, total, fuente: "db" },
      { status: 200 },
    );
  } catch {
    return viaMemoria(start, limite);
  }
};
