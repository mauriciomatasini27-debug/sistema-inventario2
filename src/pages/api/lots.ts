import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { crearLote, listarLotesDetalle } from "../../lib/repos/lotes.js";

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
// PERS2-S23: el lote va por el repo de lotes y el movimiento ALTA solo por
// stock.ts. En multi sin base el repo propaga BaseNoDisponible (503).
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
  const idem = b.idempotency_key ?? (headerKey || crypto.randomUUID());
  let r: Awaited<ReturnType<typeof crearLote>>;
  try {
    r = await crearLote({
      sku,
      cantidad: b.cantidad,
      venceEl: b.vence_el ?? null,
      costoCentavos: b.costo_centavos,
      controlaVencimiento: b.controla_vencimiento,
      idemKey: idem,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "SIN_VENCIMIENTO") return Response.json({ error: "controla_vencimiento exige vence_el" }, { status: 422 });
    return Response.json({ error: "duplicado", original: r.original }, { status: 409 });
  }
  return Response.json(r.lote, { status: 201 });
};

// GET /api/lots?sku= — lista orden FEFO (vence_el ASC, nulls last).
export const GET: APIRoute = async ({ url }) => {
  const sku = (url.searchParams.get("sku") ?? "").trim().toUpperCase();
  try {
    return Response.json({ lotes: await listarLotesDetalle(sku || null) });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
