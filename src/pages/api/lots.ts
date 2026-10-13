import type { APIRoute } from "astro";
import { z } from "zod";
import { store } from "../../lib/store.js";
import { intentarPersistir } from "../../lib/server-db.js";
import { stockLots, stockMovements } from "../../db/schema.js";

export const prerender = false;

const loteSchema = z.object({
  sku: z.string().min(1).max(64),
  cantidad: z.number().int().min(1).max(999),
  vence_el: z.string().datetime().nullable().optional(),
  costo_centavos: z.number().int().min(0).default(0),
  controla_vencimiento: z.boolean().default(false),
  idempotency_key: z.string().min(1).max(128).optional(),
});

// POST /api/lots — CAT-S3 ingreso + FEFO auto.
// Si controla_vencimiento y sin vence_el => 422. Idempotente por key.
export const POST: APIRoute = async ({ request }) => {
  const headerKey = request.headers.get("Idempotency-Key") ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = loteSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const sku = b.sku.trim().toUpperCase();
  if (b.controla_vencimiento && !b.vence_el) {
    return Response.json({ error: "controla_vencimiento exige vence_el" }, { status: 422 });
  }
  const idem = b.idempotency_key ?? (headerKey || crypto.randomUUID());
  const dup = store.stockMoves.find((m) => m.idemKey === idem && m.tipo === "ALTA");
  if (dup) return Response.json({ error: "duplicado", original: dup }, { status: 409 });
  const id = crypto.randomUUID();
  const lote = { id, sku, cantidad: b.cantidad, cantidadRestante: b.cantidad, venceEl: b.vence_el ?? null, costoCentavos: String(b.costo_centavos) };
  store.lotes.set(id, lote);
  store.stock.set(sku, (store.stock.get(sku) ?? 0) + b.cantidad);
  store.stockMoves.push({ idemKey: idem, sku, loteId: id, delta: b.cantidad, tipo: "ALTA" });
  void intentarPersistir((db) =>
    db.insert(stockLots).values({ sku, cantidad: b.cantidad, cantidadRestante: b.cantidad, venceEl: b.vence_el ? new Date(b.vence_el) : null, costoCentavos: BigInt(b.costo_centavos) }).onConflictDoNothing(),
  );
  void intentarPersistir((db) =>
    db.insert(stockMovements).values({ idemKey: idem, sku, delta: b.cantidad, tipo: "ALTA" }).onConflictDoNothing(),
  );
  return Response.json(lote, { status: 201 });
};

// GET /api/lots?sku= — lista orden FEFO (vence_el ASC, nulls last).
export const GET: APIRoute = async ({ url }) => {
  const sku = (url.searchParams.get("sku") ?? "").trim().toUpperCase();
  let lista = [...store.lotes.values()];
  if (sku) lista = lista.filter((l) => l.sku === sku);
  lista.sort((a, b) => {
    if (!a.venceEl && !b.venceEl) return a.id < b.id ? -1 : 1;
    if (!a.venceEl) return 1;
    if (!b.venceEl) return -1;
    return a.venceEl < b.venceEl ? -1 : 1;
  });
  return Response.json({ lotes: lista });
};
