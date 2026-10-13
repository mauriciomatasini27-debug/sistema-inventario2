import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { crearVencimiento, listarVencimientos, pagarVencimiento } from "../../../lib/repos/caja.js";

export const prerender = false;

// GET /api/cash/due-items — CAJA-S3 lista + aviso 3d.
// PERS2-S12: el repo caja lee cash_due_items del tenant con DB viva.
export const GET: APIRoute = async () => {
  const ahora = Date.now();
  let lista: Awaited<ReturnType<typeof listarVencimientos>>;
  try {
    lista = await listarVencimientos();
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  return Response.json({
    vencimientos: lista.map((d) => ({
      ...d,
      avisa: new Date(d.venceEl).getTime() - ahora <= 3 * 86400_000 && d.estado === "pendiente",
    })),
  });
};

// POST /api/cash/due-items — alta vencimiento caja.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ concepto: z.string().min(1).max(200), vence_el: z.string().datetime(), monto_centavos: z.number().int().min(1) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let d: Awaited<ReturnType<typeof crearVencimiento>>;
  try {
    d = await crearVencimiento({ concepto: parsed.data.concepto, venceEl: parsed.data.vence_el, montoCentavos: parsed.data.monto_centavos });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  return Response.json(d, { status: 201 });
};

// PATCH /api/cash/due-items?id= — Registrar pago: crea egreso + marca Pagada.
export const PATCH: APIRoute = async ({ request, url }) => {
  const id = url.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "falta id" }, { status: 422 });
  const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
  let r: Awaited<ReturnType<typeof pagarVencimiento>>;
  try {
    r = await pagarVencimiento({ id, key });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ id: r.id, estado: "pagada", egreso_id: r.egresoId });
};
